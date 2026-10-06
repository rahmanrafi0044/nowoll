import type { EmailSender, OutgoingEmail, SendResult } from './types.js'

// Resend's official HTTP API (docs/integrations/resend.md):
//   POST https://api.resend.com/emails   Authorization: Bearer <API key>
//   body: from, to, subject, html, text, reply_to, tags     → { id }
//   header Idempotency-Key: the same key within 24 h is sent only once
// Plain fetch instead of Resend's SDK: one small, documented call — and a
// swappable `http` so tests use a fake server (no email is ever really sent).

export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text: () => Promise<string> }>

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export class ResendEmailSender implements EmailSender {
  readonly name = 'resend'

  constructor(
    private readonly apiKey: string,
    private readonly from: string, // "Nowoll <orders@mail.nowoll.com>"
    private readonly http: HttpFetch = (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  ) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    const body = {
      from: this.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo && { reply_to: email.replyTo }),
      // Resend tag values: letters, numbers, _ and - only.
      ...(email.tag && {
        tags: [{ name: 'type', value: email.tag.replace(/[^A-Za-z0-9_-]/g, '_') }],
      }),
    }
    let res: { status: number; text: () => Promise<string> }
    try {
      res = await this.http(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(email.idempotencyKey && { 'Idempotency-Key': email.idempotencyKey.slice(0, 256) }),
        },
        body: JSON.stringify(body),
      })
    } catch {
      return { ok: false, reason: 'Resend did not respond', retryable: true }
    }
    const json = await res
      .text()
      .then((t) => JSON.parse(t) as { id?: string; message?: string; name?: string })
      .catch(() => ({}) as { id?: string; message?: string; name?: string })
    if (res.status >= 200 && res.status < 300) return { ok: true, id: json.id ?? null }
    // 429 (rate limit) and 5xx are temporary; 4xx means the email itself is wrong — retrying won't help.
    // (The API key is never put into the reason.)
    return {
      ok: false,
      reason: `Resend ${res.status}: ${json.name ?? ''} ${json.message ?? ''}`.trim(),
      retryable: res.status === 429 || res.status >= 500,
    }
  }
}
