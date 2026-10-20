import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { EnvironmentVariables } from '../config/env.validation.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { HealthController } from './health.controller.js'

const up = () => ({ $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) })

/** A config with these SSLCommerz settings (anything else: undefined). */
function config(values: Partial<Record<keyof EnvironmentVariables, string>>) {
  return { get: (key: keyof EnvironmentVariables) => values[key] } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >
}

const controller = (prisma = up(), settings = {}) =>
  new HealthController(prisma as unknown as PrismaService, config(settings))

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    await expect(controller().check()).resolves.toMatchObject({ status: 'ok', database: 'up' })
  })

  it('returns 503 when the database is unreachable', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    await expect(controller(prisma).check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  describe('onlinePayment (step 54: never run ads on the test payment system)', () => {
    it('no SSLCommerz credentials → off', async () => {
      expect((await controller().check()).onlinePayment).toBe('off')
    })

    it('credentials without SSLCOMMERZ_IS_LIVE=true → sandbox', async () => {
      const c = controller(up(), { SSLCOMMERZ_STORE_ID: 'x', SSLCOMMERZ_STORE_PASSWORD: 'y' })
      expect((await c.check()).onlinePayment).toBe('sandbox')
    })

    it('credentials + SSLCOMMERZ_IS_LIVE=true → live', async () => {
      const c = controller(up(), {
        SSLCOMMERZ_STORE_ID: 'x',
        SSLCOMMERZ_STORE_PASSWORD: 'y',
        SSLCOMMERZ_IS_LIVE: 'true',
      })
      expect((await c.check()).onlinePayment).toBe('live')
    })

    it('reveals nothing else — no store id or password in the answer', async () => {
      const c = controller(up(), {
        SSLCOMMERZ_STORE_ID: 'nowoll-store-id',
        SSLCOMMERZ_STORE_PASSWORD: 'secret-pass',
      })
      const text = JSON.stringify(await c.check())
      expect(text).not.toContain('nowoll-store-id')
      expect(text).not.toContain('secret-pass')
    })
  })
})
