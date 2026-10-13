// Admin → Newsletter (step 42) — apps/api/src/subscribers.

export type SubscriberStatusView = 'PENDING' | 'SUBSCRIBED' | 'UNSUBSCRIBED'

export interface AdminSubscriberRow {
  id: string
  email: string
  status: SubscriberStatusView
  /** Where they signed up: homepage, footer, checkout (null = unknown/older). */
  source: string | null
  createdAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  /** When Resend last got this person's current state (null = never). */
  resendSyncedAt: string | null
  resendError: string | null
}

export interface AdminSubscribersPage {
  counts: { subscribed: number; pending: number; unsubscribed: number; newLast30Days: number }
  items: AdminSubscriberRow[]
  total: number
  page: number
  pageSize: number
}

/** The Resend copy at a glance — never the key or the webhook secret. */
export interface NewsletterSyncStatus {
  enabled: boolean
  segmentSet: boolean
  /** RESEND_WEBHOOK_SECRET is set on the server (unsubscribes in Resend come back). */
  webhookSet: boolean
  /** Confirmed subscribers whose current state Resend has. */
  synced: number
  /** Confirmed subscribers not copied yet (or out of date). */
  waiting: number
  /** People whose last copy failed (the message is on their row). */
  failed: number
  lastError: string | null
}
