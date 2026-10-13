import type { ContactSyncResult } from '@nowoll/email'
import type { PrismaClient } from '@nowoll/database'
import { readSettings } from '@nowoll/validation'
import { UnrecoverableError } from 'bullmq'

// ============================================================================
// Newsletter → Resend (step 42, docs/integrations/resend.md). Our table says
// who consented; these jobs keep Resend's copy (one segment) in step. Every
// job reads the CURRENT state, so a late job never undoes a newer change.
//   Error → try again later · UnrecoverableError → stop (the error is kept on
//   the subscriber and shown in Admin → Newsletter)
// ============================================================================

export interface ContactsLike {
  subscribe(email: string, segmentId: string): Promise<ContactSyncResult>
  unsubscribe(email: string): Promise<ContactSyncResult>
  remove(email: string): Promise<ContactSyncResult>
}

export interface NewsletterDeps {
  db: PrismaClient
  /** null in development (unless EMAIL_USE_RESEND=true) or without a real key. */
  contacts: ContactsLike | null
  /** Pause between people in "sync everyone" (Resend limits requests per second). */
  pauseMs?: number
}

interface Attempt {
  attemptsMade?: number
  opts?: { attempts?: number }
}

/** Is Resend's copy of this subscriber out of date? */
export function needsSync(s: {
  status: string
  confirmedAt: Date | null
  unsubscribedAt: Date | null
  resendSyncedAt: Date | null
  resendError: string | null
}): boolean {
  if (s.resendError) return true
  if (s.status === 'SUBSCRIBED')
    return !s.resendSyncedAt || (!!s.confirmedAt && s.resendSyncedAt < s.confirmedAt)
  if (s.status === 'UNSUBSCRIBED')
    // Only if Resend ever had them — never create a contact just to unsubscribe it.
    return !!s.resendSyncedAt && !!s.unsubscribedAt && s.resendSyncedAt < s.unsubscribedAt
  return false // PENDING: not confirmed, nothing for Resend
}

/** Why nothing can be sent to Resend right now (or null when it can). */
async function blocked(deps: NewsletterDeps): Promise<{ segmentId: string } | string> {
  const s = readSettings(await deps.db.setting.findMany())
  if (!s.newsletter_resend_enabled) return 'copying to Resend is switched off'
  if (!s.newsletter_resend_segment_id) return 'no Resend segment id in Settings'
  if (!deps.contacts) return 'Resend is not used here (development, or no real RESEND_API_KEY)'
  return { segmentId: s.newsletter_resend_segment_id }
}

/** One subscriber. */
export async function syncSubscriber(
  subscriberId: string,
  deps: NewsletterDeps,
  attempt: Attempt = {},
): Promise<string> {
  const ready = await blocked(deps)
  if (typeof ready === 'string') return `skipped: ${ready}`
  const s = await deps.db.subscriber.findUnique({ where: { id: subscriberId } })
  if (!s) return 'skipped: no longer on the list'
  if (!needsSync(s)) return 'already up to date'

  const result =
    s.status === 'SUBSCRIBED'
      ? await deps.contacts!.subscribe(s.email, ready.segmentId)
      : await deps.contacts!.unsubscribe(s.email)

  if (result.ok) {
    await deps.db.subscriber.update({
      where: { id: s.id },
      data: { resendSyncedAt: new Date(), resendError: null },
    })
    return `synced ${s.status.toLowerCase()}${result.note ? ` (${result.note})` : ''}`
  }
  const lastTry = (attempt.attemptsMade ?? 0) + 1 >= (attempt.opts?.attempts ?? 1)
  if (result.retry && !lastTry) throw new Error(result.message)
  await deps.db.subscriber.update({ where: { id: s.id }, data: { resendError: result.message } })
  throw new UnrecoverableError(result.message)
}

/** Erased from our list → erased in Resend. */
export async function eraseContact(
  email: string,
  deps: NewsletterDeps,
  attempt: Attempt = {},
): Promise<string> {
  // Erasing happens even if copying is switched off now: they may have been copied before.
  if (!deps.contacts) return 'skipped: Resend is not used here'
  const result = await deps.contacts.remove(email)
  if (result.ok) return `erased in Resend${result.note ? ` (${result.note})` : ''}`
  const lastTry = (attempt.attemptsMade ?? 0) + 1 >= (attempt.opts?.attempts ?? 1)
  if (result.retry && !lastTry) throw new Error(result.message)
  throw new UnrecoverableError(result.message)
}

/** "Sync everyone now": everyone whose copy is out of date, one by one. */
export async function syncAll(deps: NewsletterDeps): Promise<string> {
  const ready = await blocked(deps)
  if (typeof ready === 'string') return `skipped: ${ready}`
  const candidates = await deps.db.subscriber.findMany({
    where: {
      OR: [
        { resendError: { not: null } },
        { status: 'SUBSCRIBED' },
        { status: 'UNSUBSCRIBED', resendSyncedAt: { not: null } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  let done = 0
  let failed = 0
  for (const s of candidates.filter(needsSync)) {
    try {
      // "Not the last try": a temporary error then throws a plain Error, which stops the run.
      await syncSubscriber(s.id, deps, { attemptsMade: 0, opts: { attempts: 2 } })
      done++
    } catch (e) {
      failed++
      // Resend says "slow down" → stop here; the job is tried again later
      // (everyone already done is now up to date, so nothing is repeated).
      if (!(e instanceof UnrecoverableError)) throw e
    }
    if (deps.pauseMs) await new Promise((r) => setTimeout(r, deps.pauseMs))
  }
  return `synced ${done}, failed ${failed}`
}
