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
}
