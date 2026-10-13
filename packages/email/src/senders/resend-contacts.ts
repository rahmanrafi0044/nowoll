import type { HttpFetch } from './resend.js'

// ============================================================================
// Resend CONTACTS for the newsletter (step 42 — docs/integrations/resend.md).
// Our `subscribers` table decides who has consented; this keeps Resend's copy
// (one segment) in step, so Rafi can send Broadcasts from Resend.
//
// Only documented calls are used. What Resend answers for "create a contact
// that exists" or "add to a segment it's already in" is NOT documented, so we
// never depend on it: we UPDATE first and CREATE only after a 404, and any
// other refusal is reported (shown in Admin → Newsletter), never guessed at.
// ============================================================================

const BASE = 'https://api.resend.com'
const TIMEOUT_MS = 10_000

export type ContactSyncResult =
  | { ok: true; note?: string }
  | {
      ok: false
      /** Temporary (429, 5xx, no answer) — try again later. */
      retry: boolean
      /** The key is wrong or "sending access" only (401/403) — a server step. */
      keyProblem: boolean
      message: string
    }

interface Answer {
  status: number
  name: string
  message: string
}

export class ResendContacts {
  constructor(
    private readonly apiKey: string,
    private readonly http: HttpFetch = (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  ) {}

  /** Confirmed → in the segment, subscribed. */
  async subscribe(email: string, segmentId: string): Promise<ContactSyncResult> {
    const updated = await this.call('PATCH', `/contacts/${enc(email)}`, { unsubscribed: false })
    if (updated.status === 404) {
      const created = await this.call('POST', '/contacts', {
        email,
        unsubscribed: false,
        segments: [{ id: segmentId }],
      })
      return result(created)
    }
    if (!ok(updated)) return result(updated)
    return result(await this.call('POST', `/contacts/${enc(email)}/segments/${enc(segmentId)}`))
  }

  /** Unsubscribed → no more Broadcasts (Resend's global flag). Not in Resend = nothing to do. */
  async unsubscribe(email: string): Promise<ContactSyncResult> {
    const r = await this.call('PATCH', `/contacts/${enc(email)}`, { unsubscribed: true })
    return r.status === 404 ? { ok: true, note: 'not in Resend' } : result(r)
  }

  /** Erased from our list → erased in Resend too. */
  async remove(email: string): Promise<ContactSyncResult> {
    const r = await this.call('DELETE', `/contacts/${enc(email)}`)
    return r.status === 404 ? { ok: true, note: 'not in Resend' } : result(r)
  }

  private async call(method: string, path: string, body?: object): Promise<Answer> {
    try {
      const res = await this.http(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : '',
      })
      const json = await res
        .text()
        .then((t) => (t ? (JSON.parse(t) as Record<string, unknown>) : {}))
        .catch(() => ({}) as Record<string, unknown>)
      return {
        status: res.status,
        name: typeof json.name === 'string' ? json.name : '',
        message: typeof json.message === 'string' ? json.message : '',
      }
    } catch {
      return { status: 0, name: 'no_answer', message: 'Resend did not respond' }
    }
  }
}

const enc = encodeURIComponent
const ok = (a: Answer) => a.status >= 200 && a.status < 300

/** The API key never appears in a message. */
function result(a: Answer): ContactSyncResult {
  if (ok(a)) return { ok: true }
  const keyProblem = a.status === 401 || a.status === 403
  return {
    ok: false,
    retry: a.status === 0 || a.status === 429 || a.status >= 500,
    keyProblem,
    message:
      a.status === 0
        ? a.message
        : keyProblem
          ? `Resend refused the API key (${a.status} ${a.name}) — it needs "Full access" for contacts`
          : `Resend ${a.status}: ${`${a.name} ${a.message}`.trim() || 'refused'}`,
  }
}
