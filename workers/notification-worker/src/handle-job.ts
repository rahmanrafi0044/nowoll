import type { PrismaClient } from '@nowoll/database'
import {
  backInStockEmail,
  type EmailContent,
  type EmailSender,
  exampleByTag,
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
import { emailBrand, readSettings } from '@nowoll/validation'
import { UnrecoverableError } from 'bullmq'
import { type ContactsLike, eraseContact, syncAll, syncSubscriber } from './newsletter-sync.js'

export interface Deps {
  db: PrismaClient
  sender: EmailSender
  siteUrl: string
  /** Newsletter → Resend (step 42); null = not used here. */
  contacts?: ContactsLike | null
  pauseMs?: number
}

export interface NotificationJob<N extends NotificationJobName = NotificationJobName> {
  id?: string
  name: N
  data: NotificationJobs[N]
  attemptsMade?: number
  opts?: { attempts?: number }
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

    // Admin → Content → Emails → "Send me a test" (step 43b): the example email
    // with the wording on the admin's screen (checked by the API), to the admin.
    case 'email-test': {
      const t = job.data as NotificationJobs['email-test']
      const example = exampleByTag(t.tag)
      if (!example) throw new UnrecoverableError(`No example for ${t.tag}`)
      const settings = readSettings(await deps.db.setting.findMany())
      const email = await renderEmail(
        example,
        emailBrand(settings, { isActive: true, data: t.wording }),
      )
      const result = await deps.sender.send({
        to: t.to,
        subject: `[Test] ${email.subject}`,
        html: email.html,
        text: email.text,
        tag: 'email-test',
      })
      if (result.ok) return `sent test of ${t.tag}`
      if (result.retryable) throw new Error(result.reason)
      throw new UnrecoverableError(result.reason)
    }

    // Newsletter → Resend (step 42) — no email; see newsletter-sync.ts.
    case 'newsletter-sync':
      return syncSubscriber(data.subscriberId!, newsletterDeps(deps), job)
    case 'newsletter-erase':
      return eraseContact(data.email!, newsletterDeps(deps), job)
    case 'newsletter-sync-all':
      return syncAll(newsletterDeps(deps))

    // 38f "Notify me when it's back": a size was restocked. Re-check that it
    // really is for sale now, then email everyone still waiting — each ONCE
    // (notifiedAt is set right after their email). If the email service has a
    // hiccup halfway, the retry carries on with those not yet emailed.
    case 'back-in-stock': {
      const v = await deps.db.productVariant.findUnique({
        where: { id: data.variantId },
        include: { product: true },
      })
      if (!v) throw new UnrecoverableError('Size not found')
      const forSale =
        v.isActive &&
        !v.deletedAt &&
        v.stock > 0 &&
        v.product.status === 'ACTIVE' &&
        !v.product.deletedAt
      if (!forSale) return 'skipped: not in stock or not for sale'
      const waiting = await deps.db.stockAlert.findMany({
        where: { variantId: v.id, notifiedAt: null },
        orderBy: { createdAt: 'asc' },
      })
      if (waiting.length === 0) return 'skipped: nobody waiting'
      const email = await render(
        deps,
        backInStockEmail({
          productName: v.product.name,
          variantLabel: `${v.size} / ${v.color}`,
          price: (v.price ?? v.product.basePrice).toString(),
          productUrl: `${site}/products/${v.product.slug}`,
        }),
      )
      let sent = 0
      let refused = 0
      for (const alert of waiting) {
        const result = await deps.sender.send({
          ...email,
          to: alert.email,
          // Per person: a retry of this job never emails someone twice.
          idempotencyKey: `${job.id ?? 'back-in-stock'}_${alert.id}`,
        })
        if (!result.ok && result.retryable) throw new Error(result.reason) // try again later
        // Sent — or refused for good (e.g. a mistyped address): either way, done with them.
        await deps.db.stockAlert.update({
          where: { id: alert.id },
          data: { notifiedAt: new Date() },
        })
        if (result.ok) sent++
        else refused++
      }
      return `sent back-in-stock to ${sent}${refused ? ` (${refused} refused)` : ''}`
    }

    default:
      throw new UnrecoverableError(`Unknown job: ${String(job.name)}`)
  }
}

/** An email ready to send to anyone: subject, HTML, text, tag and reply-to. */
async function render(deps: Deps, content: EmailContent) {
  // The store's name, tagline, colour and reply-to address come from Admin → Settings (step 38).
  const settings = readSettings(await deps.db.setting.findMany())
  // Step 43b: Admin → Content → Emails — wording, footer and (if switched on) the logo.
  const wording = await deps.db.contentBlock.findUnique({ where: { key: 'email_wording' } })
  const email = await renderEmail(content, emailBrand(settings, wording))
  const replyTo = settings.store_email
  return {
    subject: email.subject,
    html: email.html,
    text: email.text,
    tag: email.tag,
    ...(replyTo && { replyTo }),
  }
}

async function send(
  deps: Deps,
  job: NotificationJob,
  to: string,
  content: EmailContent,
): Promise<string> {
  const email = await render(deps, content)
  const result = await deps.sender.send({
    to,
    ...email,
    ...(job.id && { idempotencyKey: job.id }),
  })
  if (result.ok) return `sent ${email.tag} (${result.id ?? 'no id'})`
  if (result.retryable) throw new Error(result.reason)
  throw new UnrecoverableError(result.reason)
}

/** Same rule as the API (0–90, else 7) — the shared readSettings. */
async function returnWindowDays(db: PrismaClient): Promise<number> {
  return readSettings(await db.setting.findMany()).return_window_days
}

const newsletterDeps = (deps: Deps) => ({
  db: deps.db,
  contacts: deps.contacts ?? null,
  pauseMs: deps.pauseMs,
})
