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
import { emailBrand, readSettings, type StoreSettings } from '@nowoll/validation'
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
      // Admin → Settings decides where alerts go; the server's EMAIL_ADMIN if it's empty.
      const settings = await storeSettings(deps.db)
      return send(
        deps,
        job,
        settings.admin_notification_email || deps.adminEmail,
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
  // The store's name, tagline, colour and reply-to address come from Admin → Settings (step 38).
  const settings = await storeSettings(deps.db)
  // Step 43b: Admin → Content → Emails — wording, footer and (if switched on) the logo.
  const wording = await deps.db.contentBlock.findUnique({ where: { key: 'email_wording' } })
  const email = await renderEmail(content, emailBrand(settings, wording))
  const replyTo = settings.store_email || null
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

/** The store's settings (a missing or broken one is its default — readSettings). */
async function storeSettings(db: PrismaClient): Promise<StoreSettings> {
  return readSettings(await db.setting.findMany())
}
