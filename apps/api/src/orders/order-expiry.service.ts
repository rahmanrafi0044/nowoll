import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@nowoll/database/enums'
import { PaymentsService } from '../payments/payments.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { OrdersService } from './orders.service.js'

const FIVE_MINUTES_MS = 5 * 60 * 1000

/**
 * Decision #2: an online order whose payment is never completed (the customer
 * closed the SSLCommerz page) would hold stock forever. Every 5 minutes this
 * cancels online orders still unpaid after `payment_timeout_minutes` (setting,
 * default 30) — releasing their stock and discount use.
 *
 * Step 20: the window counts from the order OR its latest payment attempt,
 * whichever is later — so a customer who pressed "Pay" at minute 29 isn't
 * cancelled mid-payment. And SSLCommerz is asked first (a notification can
 * get lost): a paid order is confirmed instead, and if SSLCommerz doesn't
 * answer, the order waits for the next round.
 * TODO(phase 4): move to a BullMQ repeatable job in the worker.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  @Interval(FIVE_MINUTES_MS)
  async run(): Promise<void> {
    const count = await this.expireUnpaidOrders(new Date())
    if (count > 0) this.logger.log(`Cancelled ${count} unpaid online order(s)`)
  }

  /** Returns how many orders were cancelled. `now` is a parameter so tests can control time. */
  async expireUnpaidOrders(now: Date): Promise<number> {
    const minutes = await this.settings.paymentTimeoutMinutes()
    const cutoff = new Date(now.getTime() - minutes * 60_000)
    const stale = await this.prisma.order.findMany({
      where: {
        paymentMethod: PaymentMethod.SSLCOMMERZ,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING, // UNDER_REVIEW payments are left for a human
        createdAt: { lt: cutoff },
        payments: { none: { initiatedAt: { gte: cutoff } } }, // no recent "Pay" press
      },
      select: { id: true },
      take: 200,
    })

    let cancelled = 0
    for (const { id } of stale) {
      try {
        const check = await this.payments.checkBeforeExpiry(id)
        if (check !== 'NOT_PAID') continue // PAID: just confirmed. UNKNOWN: ask again next round.
        const result = await this.orders.cancel(id, {
          reason: `Online payment not completed within ${minutes} minutes`,
          onlyIfUnpaid: true, // re-checked under a lock: a payment that just arrived wins
        })
        if (result.cancelled) cancelled++
      } catch (error) {
        this.logger.error(`Could not expire order ${id}: ${String(error)}`)
      }
    }
    return cancelled
  }
}
