import type { PrismaClient } from '@nowoll/database'
import {
  type EmailContent,
  type EmailSender,
  lowStockEmail,
  orderConfirmationEmail,
  paymentConfirmedEmail,
  renderEmail,
} from '@nowoll/email'
import type { OrderJobName, OrderJobs } from '@nowoll/queues'
import { UnrecoverableError } from 'bullmq'
import { loadReceipt } from './order-email-data.js'

export interface Deps {
  db: PrismaClient
  sender: EmailSender
  siteUrl: string
  adminUrl: string
  adminEmail: string
}

/** The parts of a BullMQ job this needs (so tests can pass plain objects). */
export interface OrderJob<N extends OrderJobName = OrderJobName> {
  id?: string
  name: N
  data: OrderJobs[N]
}

// ============================================================================
// What each job does (step 27). Throwing tells BullMQ how to react:
//   Error              → try again later (5 tries, doubling waits)
//   UnrecoverableError → stop; retrying can't help (e.g. a bad email address)
// The job's id is the email's Idempotency-Key: a retry that follows a send
// whose answer got lost is still ONE email at Resend.
// Returns a short note for the log.
// ============================================================================
export async function handleOrderJob(job: OrderJob, deps: Deps): Promise<string> {
  switch (job.name) {
    case 'order-confirmation': {
      const found = await loadReceipt(
        deps.db,
        (job.data as OrderJobs['order-confirmation']).orderId,
        deps.siteUrl,
      )
      if (!found) throw new UnrecoverableError('Order not found')
      if (found.order.paymentMethod !== 'COD')
        return 'skipped: online orders get "payment received" instead'
      return send(
        deps,
        job,
        found.order.email,
        orderConfirmationEmail({ ...found.data, paymentMethod: 'COD' }),
      )
    }
    case 'payment-confirmed': {
      const found = await loadReceipt(
        deps.db,
        (job.data as OrderJobs['payment-confirmed']).orderId,
        deps.siteUrl,
      )
      if (!found) throw new UnrecoverableError('Order not found')
      // Only a payment that is (still) PAID gets "Payment received ✓".
      if (found.order.paymentStatus !== 'PAID')
        return `skipped: payment is ${found.order.paymentStatus}`
      return send(deps, job, found.order.email, paymentConfirmedEmail(found.data))
    }
    case 'low-stock-alert': {
      const { alerts } = job.data as OrderJobs['low-stock-alert']
      if (alerts.length === 0) return 'skipped: nothing low'
      return send(
        deps,
        job,
        deps.adminEmail,
        lowStockEmail({
          items: alerts,
          inventoryUrl: `${deps.adminUrl.replace(/\/+$/, '')}/inventory`,
        }),
      )
    }
    default:
      throw new UnrecoverableError(`Unknown job: ${String(job.name)}`)
  }
}

async function send(deps: Deps, job: OrderJob, to: string, content: EmailContent): Promise<string> {
  const email = await renderEmail(content)
  const replyTo = await storeEmail(deps.db)
  const result = await deps.sender.send({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tag: email.tag,
    ...(replyTo && { replyTo }),
    ...(job.id && { idempotencyKey: job.id }),
  })
  if (result.ok) return `sent ${email.tag} (${result.id ?? 'no id'})`
  if (result.retryable) throw new Error(result.reason)
  throw new UnrecoverableError(result.reason)
}

/** Replies go to the store's public email (Admin → Settings), if one is set. */
async function storeEmail(db: PrismaClient): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: 'store_email' } })
  return typeof row?.value === 'string' && row.value.includes('@') ? row.value : null
}
