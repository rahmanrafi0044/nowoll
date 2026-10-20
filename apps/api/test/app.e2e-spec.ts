// INTEGRATION TESTS: boot the real AppModule with the real middleware stack
// (configureApp) and send real HTTP requests. Only the database is replaced by
// a fake, so these run anywhere — including CI — without Postgres.
import { Body, Controller, Get, Post } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { IsEmail } from 'class-validator'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { StrictRateLimit } from '../src/common/decorators/strict-rate-limit.decorator.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

class SignupDto {
  @IsEmail()
  email: string
}

// Test-only routes that exercise the global pipes, guards and decorators.
@Controller('test-probe')
class ProbeController {
  @Get()
  ok() {
    return 'pong'
  }

  @Post('validate')
  validate(@Body() dto: SignupDto) {
    return dto
  }

  @Get('strict')
  @StrictRateLimit()
  strict() {
    return 'pong'
  }

  @Get('crash')
  crash() {
    throw new Error('secret internal detail')
  }
}

describe('API (integration)', () => {
  let app: NestExpressApplication
  const fakePrisma = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([1]),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile()

    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false })
    configureApp(app)
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  const http = () => request(app.getHttpServer())

  it('GET /api/v1/health → 200 wrapped in the success envelope', async () => {
    const res = await http().get('/api/v1/health').expect(200)
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', database: 'up', onlinePayment: expect.any(String) },
    })
  })

  it('GET /api/v1/health → 503 when the database is down', async () => {
    fakePrisma.$queryRaw.mockRejectedValueOnce(new Error('down'))
    const res = await http().get('/api/v1/health').expect(503)
    expect(res.body).toMatchObject({ success: false, error: 'SERVICE_UNAVAILABLE' })
  })

  it('serves routes only under /api/v1', async () => {
    await http().get('/health').expect(404)
  })

  it('unknown routes return the error envelope', async () => {
    const res = await http().get('/api/v1/does-not-exist').expect(404)
    expect(res.body).toMatchObject({ success: false, error: 'NOT_FOUND' })
  })

  it('sets Helmet security headers', async () => {
    const res = await http().get('/api/v1/health')
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('allows CORS only for ALLOWED_ORIGIN', async () => {
    const allowed = await http().get('/api/v1/health').set('Origin', 'http://localhost:3000')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000')

    const evil = await http().get('/api/v1/health').set('Origin', 'https://evil.example')
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rejects invalid input with a VALIDATION_ERROR', async () => {
    const res = await http().post('/api/v1/test-probe/validate').send({ email: 'nope' }).expect(400)
    expect(res.body).toMatchObject({ success: false, error: 'VALIDATION_ERROR' })
  })

  it('rejects properties the DTO does not declare (mass-assignment protection)', async () => {
    const res = await http()
      .post('/api/v1/test-probe/validate')
      .send({ email: 'rafi@nowoll.com', role: 'ADMIN' })
      .expect(400)
    expect(res.body.message).toContain('role should not exist')
  })

  it('never leaks internal error details', async () => {
    const res = await http().get('/api/v1/test-probe/crash').expect(500)
    expect(res.body).toEqual({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    })
  })

  it('limits normal routes to 100 requests per minute', async () => {
    for (let i = 0; i < 100; i++) await http().get('/api/v1/test-probe').expect(200)
    const res = await http().get('/api/v1/test-probe').expect(429)
    expect(res.body).toMatchObject({ success: false, error: 'TOO_MANY_REQUESTS' })
  })

  it('the shop’s own server (secret header) is not limited; a wrong secret is (step 48)', async () => {
    const key = 'k'.repeat(40)
    process.env.INTERNAL_API_KEY = key
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile()
    const internal = moduleRef.createNestApplication<NestExpressApplication>({ logger: false })
    configureApp(internal)
    await internal.init()
    try {
      const get = () => request(internal.getHttpServer()).get('/api/v1/test-probe')
      for (let i = 0; i < 110; i++) await get().set('x-internal-key', key).expect(200)
      for (let i = 0; i < 100; i++) await get().set('x-internal-key', 'k'.repeat(39) + 'x')
      await get()
        .set('x-internal-key', 'k'.repeat(39) + 'x')
        .expect(429)
      await get().expect(429) // no header: an ordinary visitor
    } finally {
      delete process.env.INTERNAL_API_KEY
      await internal.close()
    }
  })

  it('limits @StrictRateLimit() routes to 5 requests per minute', async () => {
    for (let i = 0; i < 5; i++) await http().get('/api/v1/test-probe/strict').expect(200)
    await http().get('/api/v1/test-probe/strict').expect(429)
  })

  it('does not rate-limit the health check', async () => {
    for (let i = 0; i < 110; i++) await http().get('/api/v1/health').expect(200)
  })
})
