import { Inject, Injectable, Logger } from '@nestjs/common'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@nowoll/database/enums'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** Steadfast's words for a parcel that needs the shop's attention (docs/integrations/courier.md). */
const NEEDS_ATTENTION: Record<string, string> = {
  partial_delivered: 'only part was delivered — the rest comes back',
  cancelled: 'not delivered — the parcel comes back to you',
  hold: 'on hold — usually an address or payment question; contact Steadfast',
  exceptional: 'lost or damaged — contact Steadfast',
}

export type UpdateOutcome = 'delivered' | 'flagged' | 'noted' | 'unknown_parcel'

// ============================================================================
// Delivery updates from the courier (Phase 2, Part B). Steadfast's webhook
// says "parcel X is now <status>"; this decides what that means for the order.
//
//   delivered            → order DELIVERED, a COD order marked paid (Steadfast
//                          collected the cash), customer emailed once
//   partial / cancelled / hold / exceptional → order unchanged, a note in its
//                          history so staff see it ("flagged")
//   anything else (incl. *_approval_pending — "the rider's word, not ours yet")
//                        → only the status is shown
// The same update twice changes nothing more (and the "delivered" email has a
// fixed job id, so it is sent once).
// ============================================================================
@Injectable()
export class CourierUpdatesService {
  private readonly logger = new Logger(CourierUpdatesService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CUSTOMER_NOTIFIER) private readonly notifier: CustomerNotifier,
  ) {}

  async parcelStatus(
    courierName: string,
    consignmentId: string,
    status: string,
  ): Promise<UpdateOutcome> {
    const now = new Date()
    const outcome = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { courierName, courierConsignmentId: consignmentId },
      })
      if (!order) return 'unknown_parcel' as const
      // Lock the order: an admin changing it at the same moment waits for us.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } })
      const repeat = fresh.courierStatus === status

      if (status === 'delivered' && fresh.status === OrderStatus.SHIPPED) {
        const codUnpaid =
          fresh.paymentMethod === PaymentMethod.COD && fresh.paymentStatus !== PaymentStatus.PAID
        await tx.order.update({
          where: { id: fresh.id },
          data: {
            status: OrderStatus.DELIVERED,
            deliveredAt: now,
            courierStatus: status,
            courierStatusAt: now,
            ...(codUnpaid && { paymentStatus: PaymentStatus.PAID }),
            statusHistory: {
              create: {
                fromStatus: OrderStatus.SHIPPED,
                toStatus: OrderStatus.DELIVERED,
                note: `Delivered — confirmed by ${courierName}${codUnpaid ? ' (cash collected by the courier)' : ''}`,
                changedById: null,
              },
            },
          },
        })
        if (codUnpaid)
          await tx.payment.updateMany({
            where: { orderId: fresh.id, method: PaymentMethod.COD, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.PAID, paidAt: now },
          })
        return 'delivered' as const
      }

      const attention = NEEDS_ATTENTION[status]
      await tx.order.update({
        where: { id: fresh.id },
        data: {
          courierStatus: status,
          courierStatusAt: now,
          // A note in the history (once per status) so staff see it on the order.
          ...(attention &&
            !repeat && {
              statusHistory: {
                create: {
                  fromStatus: fresh.status,
                  toStatus: fresh.status,
                  note: `${courierName}: ${attention}`,
                  changedById: null,
                },
              },
            }),
        },
      })
      return attention ? ('flagged' as const) : ('noted' as const)
    })

    if (outcome === 'delivered') {
      const order = await this.prisma.order.findFirst({
        where: { courierName, courierConsignmentId: consignmentId },
        select: { id: true },
      })
      if (order)
        await this.notifier
          .orderDelivered(order.id)
          .catch((e: unknown) => this.logger.error(`Delivered email not queued: ${String(e)}`))
    }
    if (outcome === 'unknown_parcel')
      this.logger.warn(`${courierName} update for a parcel we don't know (${consignmentId})`)
    return outcome
  }
}
