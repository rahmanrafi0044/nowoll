import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { PrismaService } from '../prisma/prisma.service.js'

// GET /api/v1/health — used by Docker, Nginx and UptimeRobot to ask
// "is the API alive and can it reach the database?"
@Controller('health')
@SkipThrottle() // monitors poll this often; never rate-limit it
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      throw new ServiceUnavailableException('Database is unreachable')
    }
    return { status: 'ok', database: 'up' }
  }
}
