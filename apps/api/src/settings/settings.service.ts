import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { PrismaService } from '../prisma/prisma.service.js'

// Reads admin-configurable business rules from the `settings` table
// (CLAUDE.md Rule 6). Phase 5 step 38 adds the admin endpoints to edit them.
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store-wide low-stock threshold (a variant's own threshold overrides it).
   * If the setting is missing or not a whole number ≥ 0, we fall back to 5 and
   * log a warning (approved decision #4) — a broken setting must not break
   * the inventory pages or stock changes.
   *
   * Pass `db` when calling from INSIDE a transaction. Using the main client
   * there would ask the connection pool for a second connection while this
   * transaction holds a row lock — under load every connection can end up
   * waiting for that lock, and nothing can finish (a pool deadlock).
   */
  async lowStockThreshold(
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const FALLBACK = 5
    const row = await db.setting.findUnique({ where: { key: 'low_stock_threshold' } })
    const value = row?.value
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value

    this.logger.warn(
      `Setting low_stock_threshold is ${row ? `invalid (${JSON.stringify(value)})` : 'missing'} — using ${FALLBACK}. Fix it in Admin → Settings.`,
    )
    return FALLBACK
  }

  /**
   * VAT percentage added at checkout on (products − discount), e.g. 7.5.
   * Missing/invalid → 0 with a warning: never charge customers an unknown tax.
   */
  async vatRate(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    const row = await db.setting.findUnique({ where: { key: 'vat_rate' } })
    const value = row?.value
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)
      return value
    this.logger.warn(
      `Setting vat_rate is ${row ? `invalid (${JSON.stringify(value)})` : 'missing'} — charging 0% VAT. Fix it in Admin → Settings.`,
    )
    return 0
  }

  /**
   * Minutes an online (SSLCommerz) order may stay unpaid before it's cancelled
   * and its stock released. Missing/invalid (outside 5–1440) → 30 with a warning.
   */
  async paymentTimeoutMinutes(
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const row = await db.setting.findUnique({ where: { key: 'payment_timeout_minutes' } })
    const value = row?.value
    if (typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 1440)
      return value
    this.logger.warn(
      `Setting payment_timeout_minutes is ${row ? `invalid (${JSON.stringify(value)})` : 'missing'} — using 30. Fix it in Admin → Settings.`,
    )
    return 30
  }

  /**
   * Days after delivery a customer may ask for a return (step 25).
   * Missing/invalid (outside 0–90) → 7 with a warning. 0 = returns switched off.
   */
  async returnWindowDays(
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const row = await db.setting.findUnique({ where: { key: 'return_window_days' } })
    const value = row?.value
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 90)
      return value
    this.logger.warn(
      `Setting return_window_days is ${row ? `invalid (${JSON.stringify(value)})` : 'missing'} — using 7. Fix it in Admin → Settings.`,
    )
    return 7
  }
}
