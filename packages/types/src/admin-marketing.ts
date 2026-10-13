// Admin → Marketing (step 39b) — apps/api/src/marketing.

/** The setup checklist. Never the access token — only whether the server has one. */
export interface MarketingStatusView {
  pixelIdSet: boolean
  domainVerificationSet: boolean
  tokenSet: boolean
  serverEventsOn: boolean
  lastSentAt: string | null // ISO date of the last real (non-test) event Meta accepted
  lastFailure: { at: string; message: string | null } | null
}

/** One line of the delivery log (no customer details are kept in it). */
export interface MetaEventLogView {
  id: string
  orderNumber: number | null // null = the admin's test event
  eventName: string
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  test: boolean
  eventsReceived: number | null
  message: string | null
  fbtraceId: string | null
  createdAt: string
}

/** What "Send test event" answers. */
export type TestEventResultView =
  | { ok: true; eventsReceived: number; messages: string[] }
  | { ok: false; message: string; tokenProblem: boolean }

/** The Meta catalogue feed (step 39c) — Admin → Marketing → Catalog feed. */
export interface CatalogFeedReportView {
  enabled: boolean
  /** The address to paste into Meta Commerce Manager. */
  url: string
  /** Rows (sizes/colours) in the feed. */
  items: number
  /** Products left out, and why. */
  skipped: { id: string; name: string; slug: string; reason: string }[]
  builtAt: string
}
