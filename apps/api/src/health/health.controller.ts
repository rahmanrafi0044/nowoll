import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SkipThrottle } from '@nestjs/throttler'
import { isSslCommerzConfigured } from '@nowoll/payments'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * Which online payment the API is set up for:
 *   off     — no SSLCommerz credentials (only cash on delivery works)
 *   sandbox — SSLCommerz's TEST system: no real money moves
 *   live    — real payments
 */
export type OnlinePaymentMode = 'off' | 'sandbox' | 'live'

export interface HealthReport {
  status: 'ok'
  database: 'up'
  onlinePayment: OnlinePaymentMode
}

// GET /api/v1/health — used by Docker, Nginx and UptimeRobot to ask
// "is the API alive and can it reach the database?"
//
// onlinePayment (step 54, docs/launch-checklist.md): `pnpm launch-check` reads
// it to catch the worst launch mistake — ads running while payment is still
// SSLCommerz's test system. It says only off/sandbox/live: no ids, no keys.
@Controller('health')
@SkipThrottle() // monitors poll this often; never rate-limit it
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      throw new ServiceUnavailableException('Database is unreachable')
    }
    return { status: 'ok', database: 'up', onlinePayment: this.onlinePayment() }
  }

  private onlinePayment(): OnlinePaymentMode {
    const configured = isSslCommerzConfigured({
      storeId: this.config.get('SSLCOMMERZ_STORE_ID', { infer: true }),
      storePassword: this.config.get('SSLCOMMERZ_STORE_PASSWORD', { infer: true }),
    })
    if (!configured) return 'off'
    return this.config.get('SSLCOMMERZ_IS_LIVE', { infer: true }) === 'true' ? 'live' : 'sandbox'
  }
}
