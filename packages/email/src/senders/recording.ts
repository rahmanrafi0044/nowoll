import type { EmailSender, OutgoingEmail, SendResult } from './types.js'

/** Tests: keeps every email instead of sending it. `sent` is in order. */
export class RecordingEmailSender implements EmailSender {
  readonly name = 'recording'
  readonly sent: OutgoingEmail[] = []
  /** Set to make the next sends fail (to test retries). */
  failWith: SendResult | null = null

  async send(email: OutgoingEmail): Promise<SendResult> {
    if (this.failWith) return this.failWith
    this.sent.push(email)
    return { ok: true, id: `test-${this.sent.length}` }
  }
}
