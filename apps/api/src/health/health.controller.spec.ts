import { ServiceUnavailableException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service.js'
import { HealthController } from './health.controller.js'

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) }
    const controller = new HealthController(prisma as unknown as PrismaService)
    await expect(controller.check()).resolves.toEqual({ status: 'ok', database: 'up' })
  })

  it('returns 503 when the database is unreachable', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    const controller = new HealthController(prisma as unknown as PrismaService)
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
