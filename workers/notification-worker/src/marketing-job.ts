import {
  buildServerEvent,
  MAX_EVENT_AGE_MS,
  type MetaAnswer,
  type MetaServerEvent,
} from '@nowoll/analytics/server'
import type { PrismaClient } from '@nowoll/database'
import type { MarketingJobName, MarketingJobs } from '@nowoll/queues'
import { readSettings } from '@nowoll/validation'
import { UnrecoverableError } from 'bullmq'

// ============================================================================
// Meta Conversions API jobs (step 39b — docs/integrations/meta.md).
// Each job re-checks everything when it runs: the switch, the Pixel ID, the
// token, the customer's consent (the order_tracking row) and the order itself.
// One line in the delivery log (meta_events) per event, written at its final
// outcome: SENT, SKIPPED (with why) or FAILED (after the last try).
// ============================================================================

export interface MetaSenderLike {
  readonly tokenSet: boolean
  send(pixelId: string, events: MetaServerEvent[]): Promise<MetaAnswer>
}

export interface MarketingDeps {
  db: PrismaClient
  meta: MetaSenderLike
  now?: () => Date
}

export interface MarketingJob<N extends MarketingJobName = MarketingJobName> {
  id?: string
  name: N
  data: MarketingJobs[N]
  /** When the job was added (ms) — the moment the sale/delivery happened. */
  timestamp: number
  attemptsMade: number
  opts: { attempts?: number }
}

/** Browser details (IP address, cookies) are kept 60 days after the order. */
export const TRACKING_KEEP_DAYS = 60
/** The delivery log holds no customer details; a year of it is plenty. */
export const LOG_KEEP_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

export async function handleMarketingJob(job: MarketingJob, deps: MarketingDeps): Promise<string> {
  const now = deps.now?.() ?? new Date()
  if (job.name === 'tracking-cleanup') {
    const [tracking, log] = await Promise.all([
      deps.db.orderTracking.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - TRACKING_KEEP_DAYS * DAY_MS) } },
      }),
      deps.db.metaEvent.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - LOG_KEEP_DAYS * DAY_MS) } },
      }),
    ])
    return `deleted ${tracking.count} old browser details, ${log.count} old log lines`
  }

  const { kind, orderId } = job.data as MarketingJobs['meta-event']
  const order = await deps.db.order.findUnique({
    where: { id: orderId },
    include: { items: true, tracking: true },
  })
  if (!order) throw new UnrecoverableError('Order not found')
  const event = kind === 'purchase' ? 'Purchase' : 'OrderDelivered'
  const orderNumber = `NW-${order.orderNumber}`
  const eventId = `${kind}-${orderNumber}`

  const log = (status: 'SENT' | 'FAILED' | 'SKIPPED', extra: Record<string, unknown> = {}) =>
    deps.db.metaEvent.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        eventName: event,
        eventId,
        status,
        ...extra,
      },
    })
  const skip = async (why: string) => {
    await log('SKIPPED', { message: why })
    return `skipped: ${why}`
  }

  // Re-check everything — things may have changed since the job was added.
  const settings = readSettings(await deps.db.setting.findMany())
  if (!settings.meta_capi_enabled)
    return skip('Server events are switched off (Settings → Marketing and tracking)')
  if (!settings.meta_pixel_id) return skip('No Meta Pixel ID in Settings')
  if (!deps.meta.tokenSet) return skip('The access token is not set on the server')
  if (!order.tracking) return skip("No consent details (the customer's browser details are gone)")
  if (kind === 'purchase' && order.status === 'CANCELLED') return skip('The order was cancelled')
  if (kind === 'purchase' && order.paymentMethod === 'SSLCOMMERZ' && order.paymentStatus !== 'PAID')
    return skip('The online payment is not confirmed')
  if (kind === 'delivered' && order.status !== 'DELIVERED')
    return skip('The order is no longer marked delivered')
  // Meta refuses the whole request for events older than 7 days (keep an hour's margin).
  if (now.getTime() - job.timestamp > MAX_EVENT_AGE_MS - 60 * 60 * 1000)
    return skip('Too old for Meta (more than 7 days)')

  const payload = buildServerEvent({
    kind,
    at: new Date(job.timestamp),
    order: {
      orderNumber,
      total: Number(order.total),
      items: order.items.map((i) => ({
        productId: i.productId,
        sku: i.sku,
        name: i.productName,
        variant: i.variantLabel,
        price: Number(i.unitPrice),
        quantity: i.quantity,
      })),
    },
    customer: {
      email: order.email,
      phone: order.phone,
      fullName: order.customerName,
      city: order.shippingDistrict,
      postalCode: order.shippingPostalCode,
    },
    browser: {
      clientIp: order.tracking.clientIp,
      userAgent: order.tracking.userAgent,
      fbp: order.tracking.fbp,
      fbc: order.tracking.fbc,
      sourceUrl: order.tracking.sourceUrl,
    },
  })

  const answer = await deps.meta.send(settings.meta_pixel_id, [payload])
  if (answer.ok) {
    await log('SENT', {
      eventsReceived: answer.eventsReceived,
      message: answer.messages.join(' · ') || null,
      fbtraceId: answer.fbtraceId,
    })
    return `sent ${event} ${orderNumber} (received ${answer.eventsReceived})`
  }

  // Temporary trouble with tries left → BullMQ tries again later (no log line yet).
  const lastTry = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
  if (answer.retry && !lastTry) throw new Error(answer.message)
  await log('FAILED', { message: answer.message, fbtraceId: answer.fbtraceId })
  throw new UnrecoverableError(answer.message)
}
