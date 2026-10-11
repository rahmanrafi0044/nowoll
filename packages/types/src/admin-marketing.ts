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
