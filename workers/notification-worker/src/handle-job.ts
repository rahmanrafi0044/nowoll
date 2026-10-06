import type { PrismaClient } from '@nowoll/database'
import {
  type EmailContent,
  type EmailSender,
  newsletterConfirmEmail,
  orderDeliveredEmail,
  orderLink,
  orderShippedEmail,
  refundProcessedEmail,
  renderEmail,
  returnApprovedEmail,
  returnRejectedEmail,
  welcomeEmail,
} from '@nowoll/email'
import type { NotificationJobName, NotificationJobs } from '@nowoll/queues'
import { UnrecoverableError } from 'bullmq'

export interface Deps {
  db: PrismaClient
  sender: EmailSender
  siteUrl: string
}

export interface NotificationJob<N extends NotificationJobName = NotificationJobName> {
  id?: string
  name: N
  data: NotificationJobs[N]
}

const displayNumber = (n: number) => `NW-${n}`

// ============================================================================
// What each notification job does (step 28). Like the order worker:
//   Error → try again later · UnrecoverableError → stop (hopeless)
//   the job id is the email's Idempotency-Key.
// Every job re-checks the CURRENT state before sending: a "return approved"
// job for a return that's no longer approved, or a newsletter confirmation
// for someone already confirmed, sends nothing.
// ============================================================================
export async function handleNotificationJob(job: NotificationJob, deps: Deps): Promise<string> {
  const site = deps.siteUrl.replace(/\/+$/, '')
  const data = job.data as Record<string, string>

  switch (job.name) {
    case 'welcome': {
      const user = await deps.db.user.findUnique({ where: { id: data.userId } })
      if (!user) throw new UnrecoverableError('User not found')
      if (user.status !== 'ACTIVE' || user.deletedAt) return 'skipped: account disabled'
      return send(
        deps,
        job,
        user.email,
        welcomeEmail({ name: user.fullName, shopUrl: `${site}/shop` }),
      )
    }

    case 'newsletter-confirm': {
      const s = await deps.db.subscriber.findUnique({ where: { id: data.subscriberId } })
      if (!s || !s.confirmToken) throw new UnrecoverableError('Subscriber not found')
      if (s.status !== 'PENDING') return `skipped: already ${s.status.toLowerCase()}`
      const token = encodeURIComponent(s.confirmToken)
      return send(
        deps,
        job,
        s.email,
        newsletterConfirmEmail({
          confirmUrl: `${site}/newsletter/confirm?token=${token}`,
          unsubscribeUrl: `${site}/newsletter/unsubscribe?token=${token}`,
        }),
      )
    }

    case 'return-approved':
    case 'return-rejected': {
      const r = await deps.db.returnRequest.findUnique({
        where: { id: data.returnId },
        include: { order: true, items: { include: { orderItem: true } } },
      })
      if (!r) throw new UnrecoverableError('Return not found')
      const wanted = job.name === 'return-approved' ? 'APPROVED' : 'REJECTED'
      if (r.status !== wanted) return `skipped: return is ${r.status}`
      const common = {
        name: r.order.customerName,
        orderNumber: displayNumber(r.order.orderNumber),
        link: orderLink(site, {
          number: displayNumber(r.order.orderNumber),
          signedIn: r.order.userId !== null,
        }),
      }
      return send(
        deps,
        job,
        r.order.email,
        job.name === 'return-approved'
          ? returnApprovedEmail({
              ...common,
              lines: r.items.map((i) => ({
                productName: i.orderItem.productName,
                variantLabel: i.orderItem.variantLabel,
                quantity: i.quantity,
              })),
              instructions: r.adminNote ?? 'We will contact you about sending the items back.',
            })
          : returnRejectedEmail({
              ...common,
              reason: r.rejectionReason ?? 'Please contact us for details.',
            }),
      )
    }

    case 'refund-processed': {
      const f = await deps.db.refund.findUnique({
        where: { id: data.refundId },
        include: { payment: { include: { order: true } } },
      })
      if (!f) throw new UnrecoverableError('Refund not found')
      if (f.status !== 'PROCESSED') return `skipped: refund is ${f.status}`
      const order = f.payment.order
      const manual =
        f.payment.method === 'COD' ||
        (f.rawResponse as { method?: string } | null)?.method === 'MANUAL'
      return send(
        deps,
        job,
        order.email,
        refundProcessedEmail({
          name: order.customerName,
          orderNumber: displayNumber(order.orderNumber),
          amount: f.amount.toString(),
          method: manual ? 'MANUAL' : 'GATEWAY',
          link: orderLink(site, {
            number: displayNumber(order.orderNumber),
            signedIn: order.userId !== null,
          }),
        }),
      )
    }

    case 'order-shipped':
    case 'order-delivered': {
      const o = await deps.db.order.findUnique({ where: { id: data.orderId } })
      if (!o) throw new UnrecoverableError('Order not found')
      const wanted = job.name === 'order-shipped' ? 'SHIPPED' : 'DELIVERED'
      if (o.status !== wanted) return `skipped: order is ${o.status}`
      const common = {
        name: o.customerName,
        orderNumber: displayNumber(o.orderNumber),
        link: orderLink(site, {
          number: displayNumber(o.orderNumber),
          signedIn: o.userId !== null,
        }),
      }
      return send(
        deps,
        job,
        o.email,
        job.name === 'order-shipped'
          ? orderShippedEmail({
              ...common,
              courierName: o.courierName,
              trackingNumber: o.trackingNumber,
            })
          : orderDeliveredEmail({ ...common, returnWindowDays: await returnWindowDays(deps.db) }),
      )
    }

    default:
      throw new UnrecoverableError(`Unknown job: ${String(job.name)}`)
  }
}

async function send(
  deps: Deps,
  job: NotificationJob,
  to: string,
  content: EmailContent,
): Promise<string> {
  const email = await renderEmail(content)
  const replyTo = await setting(deps.db, 'store_email')
  const result = await deps.sender.send({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tag: email.tag,
    ...(typeof replyTo === 'string' && replyTo.includes('@') && { replyTo }),
    ...(job.id && { idempotencyKey: job.id }),
  })
  if (result.ok) return `sent ${email.tag} (${result.id ?? 'no id'})`
  if (result.retryable) throw new Error(result.reason)
  throw new UnrecoverableError(result.reason)
}

const setting = async (db: PrismaClient, key: string) =>
  (await db.setting.findUnique({ where: { key } }))?.value

/** Same rule as the API's SettingsService.returnWindowDays (0–90, else 7). */
async function returnWindowDays(db: PrismaClient): Promise<number> {
  const v = await setting(db, 'return_window_days')
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 90 ? v : 7
}
