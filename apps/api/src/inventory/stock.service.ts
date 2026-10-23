import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import { type InventoryChangeReason, ProductStatus } from '@nowoll/database/enums'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { SettingsService } from '../settings/settings.service.js'
import { LOW_STOCK_ALERTER, type LowStockAlert, type LowStockAlerter } from './low-stock-alerter.js'

// ============================================================================
// THE ONLY PLACE STOCK CHANGES. Manual adjustments, CSV import, new variants,
// restores — and in Phase 3, orders and cancellations — all call adjust().
// That guarantees two things everywhere:
//   1. Every change writes an inventory_logs row in the SAME transaction.
//   2. Simultaneous changes (an admin adjusting while a customer checks out)
//      can never overwrite each other — see the two modes below.
// ============================================================================

/** Stock changes that count as the shop restocking a sold-out size (38f badge). */
const RESTOCK_REASONS = new Set<InventoryChangeReason>(['MANUAL_ADJUSTMENT', 'CSV_IMPORT'])

export type StockAdjustment =
  | { change: number } // add/remove: "received 20" (+20), "2 damaged" (-2)
  | { setTo: number } // exact count: "after counting, there are 14"

export interface AdjustStockInput {
  variantId: string
  adjustment: StockAdjustment
  reason: InventoryChangeReason
  note?: string | null
  orderId?: string | null
  actorId?: string | null // TODO(phase 4): the signed-in admin
}

export interface StockChange {
  variantId: string
  before: number
  after: number
  change: number
  logId: string | null // null when nothing changed (e.g. "set to 7" when it's already 7)
  alert: LowStockAlert | null // set when this change made the variant cross its threshold
  /** 38f: a sold-out size was restocked AND someone asked to be told ("Notify me"). */
  backInStock: boolean
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name)

  constructor(
    private readonly settings: SettingsService,
    @Inject(LOW_STOCK_ALERTER) private readonly alerter: LowStockAlerter,
    // 38f "Notify me" emails (optional for hand-built tests).
    @Optional() @Inject(CUSTOMER_NOTIFIER) private readonly customers?: CustomerNotifier,
  ) {}

  /**
   * Changes one variant's stock INSIDE the caller's transaction `tx`.
   * Throws (→ the whole transaction rolls back) if the variant doesn't exist
   * or there isn't enough stock to remove.
   */
  async adjust(tx: Prisma.TransactionClient, input: AdjustStockInput): Promise<StockChange> {
    const { variantId, adjustment } = input
    let before: number
    let after: number

    if ('change' in adjustment) {
      // ATOMIC UPDATE: the database does "stock = stock + change" in one step,
      // and only if the result stays ≥ 0. No read-then-write gap, so two
      // simultaneous changes both apply correctly (no "lost update").
      const rows = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE product_variants
        SET stock = stock + ${adjustment.change}, updated_at = now()
        WHERE id = ${variantId}::uuid AND deleted_at IS NULL AND stock + ${adjustment.change} >= 0
        RETURNING stock`
      if (rows.length === 0) await this.explainFailedChange(tx, variantId, adjustment.change)
      after = rows[0]!.stock
      before = after - adjustment.change
    } else {
      // ROW LOCK: "SELECT … FOR UPDATE" makes any other transaction that wants
      // to change this variant WAIT until we commit. So `before` is exactly the
      // stock we replace, and the logged change is exact.
      const locked = await tx.$queryRaw<{ stock: number }[]>`
        SELECT stock FROM product_variants WHERE id = ${variantId}::uuid AND deleted_at IS NULL FOR UPDATE`
      if (locked.length === 0) throw new NotFoundException('Variant not found')
      before = locked[0]!.stock
      after = adjustment.setTo
      if (after !== before) {
        await tx.$executeRaw`UPDATE product_variants SET stock = ${after}, updated_at = now() WHERE id = ${variantId}::uuid`
      }
    }

    const change = after - before
    if (change === 0)
      return { variantId, before, after, change, logId: null, alert: null, backInStock: false }

    // 38f "Restocked" badge: a size that was sold out is back because the shop
    // RESTOCKED it (a manual change or a CSV import) — not a new product's first
    // stock, and not one cancelled order putting a piece back.
    const restocked = before === 0 && after > 0 && RESTOCK_REASONS.has(input.reason)
    if (restocked) {
      await tx.$executeRaw`
        UPDATE products SET restocked_at = now()
        WHERE id = (SELECT product_id FROM product_variants WHERE id = ${variantId}::uuid)`
    }
    // 38f: is anyone waiting for this size? (Only then is an email job queued —
    // a CSV import restocking 300 sizes shouldn't add 300 empty jobs.)
    const backInStock =
      restocked && (await tx.stockAlert.count({ where: { variantId, notifiedAt: null } })) > 0

    const log = await tx.inventoryLog.create({
      data: {
        variantId,
        change,
        stockAfter: after,
        reason: input.reason,
        note: input.note ?? null,
        orderId: input.orderId ?? null,
        actorId: input.actorId ?? null,
      },
    })

    return {
      variantId,
      before,
      after,
      change,
      logId: log.id,
      alert: await this.lowStockAlert(tx, variantId, before, after),
      backInStock,
    }
  }

  /**
   * Call AFTER the transaction has committed — never inside it. If the
   * transaction had rolled back, the stock never really changed, and an alert
   * would be a false alarm. Failures are logged, not thrown: the stock change
   * already succeeded and must not be reported as an error.
   */
  async notifyLowStock(changes: StockChange[]): Promise<void> {
    const alerts = changes.flatMap((c) => (c.alert ? [c.alert] : []))
    if (alerts.length > 0)
      await this.alerter
        .notify(alerts)
        .catch((e: unknown) => this.logger.error(`Low-stock alert failed: ${String(e)}`))
    // 38f: the same moment (after commit) tells waiting shoppers a size is back.
    for (const c of changes.filter((x) => x.backInStock))
      await this.customers
        ?.backInStock(c.variantId)
        .catch((e: unknown) => this.logger.error(`Back-in-stock job failed: ${String(e)}`))
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Alert only when the variant CROSSES its threshold (was above, now at or
   * below) — one alert when "M / Blue" drops to 5, not another on every sale
   * after that. Only for active variants of published products (decision #2).
   */
  private async lowStockAlert(
    tx: Prisma.TransactionClient,
    variantId: string,
    before: number,
    after: number,
  ): Promise<LowStockAlert | null> {
    if (after >= before) return null // restocking never triggers an alert

    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { product: { select: { name: true, status: true, deletedAt: true } } },
    })
    if (
      !variant.isActive ||
      variant.product.status !== ProductStatus.ACTIVE ||
      variant.product.deletedAt
    ) {
      return null
    }

    // `tx`, not the main client: everything inside adjust() must use the
    // transaction's own connection (see SettingsService.lowStockThreshold).
    const threshold = variant.lowStockThreshold ?? (await this.settings.lowStockThreshold(tx))
    if (!(before > threshold && after <= threshold)) return null

    return {
      variantId,
      sku: variant.sku,
      productName: variant.product.name,
      variantLabel: `${variant.size} / ${variant.color}`,
      stock: after,
      threshold,
    }
  }

  private async explainFailedChange(
    tx: Prisma.TransactionClient,
    variantId: string,
    change: number,
  ): Promise<never> {
    const current = await tx.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
      select: { stock: true },
    })
    if (!current) throw new NotFoundException('Variant not found')
    throw new ConflictException(`Can't remove ${-change}: only ${current.stock} in stock.`)
  }
}
