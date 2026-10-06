// ============================================================================
// ADAPTER PATTERN (like payments and image storage): code that sends email
// talks to EmailSender and never knows which service is behind it.
//   ResendEmailSender   — production (Resend's HTTP API)
//   SmtpEmailSender     — development: Mailpit catches everything (localhost:8025)
//   RecordingEmailSender— tests: nothing is sent, every email is kept in memory
// ============================================================================

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /** Where replies go (e.g. the store's support address). */
  replyTo?: string
  /** A label shown in Resend's dashboard, e.g. "order-confirmation". */
  tag?: string
  /**
   * The same key twice = sent once (Resend keeps keys for 24 h). Background
   * workers retry failed jobs (step 27), so every email gets a stable key
   * like "order-confirmation:NW-10001".
   */
  idempotencyKey?: string
}

export type SendResult =
  | { ok: true; id: string | null }
  // retryable: worth trying again later (network trouble, rate limit, provider down)
  | { ok: false; reason: string; retryable: boolean }

export interface EmailSender {
  readonly name: string
  send(email: OutgoingEmail): Promise<SendResult>
}
