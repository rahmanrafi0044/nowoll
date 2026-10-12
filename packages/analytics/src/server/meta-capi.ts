import { createHash } from 'node:crypto'
import { CURRENCY, type TrackedItem } from '../events.js'

// ============================================================================
// Meta Conversions API — server side (step 39b). Builds the events, hashes
// the customer's details the way Meta asks, and reads Meta's answer. Field
// names and rules: docs/integrations/meta.md (checked against Meta's docs).
// Pure functions + one sender that takes `fetch` as a parameter, so tests
// talk to a fake Meta and never the real one.
// ============================================================================

/** The Graph API version this code was written and checked against. */
export const META_GRAPH_VERSION = 'v25.0'

/** Meta refuses the WHOLE request if any event is older than 7 days. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** SHA-256, lowercase hex — what Meta expects for every hashed field. */
export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

/** Letters (with their vowel signs, e.g. Bangla ি) and digits only, lowercase — no punctuation or spaces. */
const lettersOnly = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Digits only, with the country code: +8801712345678 / 01712345678 → 8801712345678. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('880')) return digits
  if (digits.startsWith('0')) return `88${digits}`
  return digits
}

/** "Rahim Uddin Ahmed" → first "rahim", last "ahmed" (one word → first name only). */
export function splitName(fullName: string): { fn: string; ln: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    fn: lettersOnly(words[0] ?? ''),
    ln: words.length > 1 ? lettersOnly(words.at(-1)!) : '',
  }
}

/** The customer's details, as stored on the order. */
export interface CustomerDetails {
  email: string
  phone: string
  fullName: string
  /** The district, e.g. "Dhaka". */
  city: string
  postalCode: string | null
}

/** Browser details saved at checkout (only with Marketing consent). */
export interface BrowserDetails {
  clientIp: string
  userAgent: string
  fbp: string | null
  fbc: string | null
  sourceUrl: string
}

export interface MetaUserData {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  zp?: string[]
  country: string[]
  external_id?: string[]
  client_ip_address: string
  client_user_agent: string
  fbp?: string
  fbc?: string
}

/** Hash what Meta asks to be hashed; send the browser details as they are (Meta's rule). */
export function metaUserData(c: CustomerDetails, b: BrowserDetails): MetaUserData {
  const { fn, ln } = splitName(c.fullName)
  const ct = lettersOnly(c.city)
  const zp = (c.postalCode ?? '').toLowerCase().replace(/\s/g, '')
  const email = normalizeEmail(c.email)
  const phone = normalizePhone(c.phone)
  return {
    ...(email && { em: [sha256(email)] }),
    ...(phone && { ph: [sha256(phone)] }),
    ...(fn && { fn: [sha256(fn)] }),
    ...(ln && { ln: [sha256(ln)] }),
    ...(ct && { ct: [sha256(ct)] }),
    ...(zp && { zp: [sha256(zp)] }),
    country: [sha256('bd')],
    ...(email && { external_id: [sha256(email)] }),
    client_ip_address: b.clientIp,
    client_user_agent: b.userAgent,
    ...(b.fbp && { fbp: b.fbp }),
    ...(b.fbc && { fbc: b.fbc }),
  }
}

export interface ServerOrder {
  orderNumber: string
  items: TrackedItem[]
  total: number
}

export interface MetaServerEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url: string
  user_data: MetaUserData
  custom_data: Record<string, unknown>
}

const orderCustomData = (o: ServerOrder) => ({
  value: Math.round(o.total * 100) / 100,
  currency: CURRENCY,
  content_ids: o.items.map((i) => i.sku),
  content_type: 'product',
  contents: o.items.map((i) => ({
    id: i.sku,
    quantity: i.quantity,
    item_price: Math.round(i.price * 100) / 100,
  })),
  num_items: o.items.reduce((s, i) => s + i.quantity, 0),
  order_id: o.orderNumber,
})

/** The event names and IDs we send (the Purchase ID matches the browser Pixel's — step 39a). */
export const SERVER_EVENTS = {
  purchase: { name: 'Purchase', id: (n: string) => `purchase-${n}` },
  delivered: { name: 'OrderDelivered', id: (n: string) => `delivered-${n}` },
} as const
export type ServerEventKind = keyof typeof SERVER_EVENTS

export function buildServerEvent(input: {
  kind: ServerEventKind
  order: ServerOrder
  customer: CustomerDetails
  browser: BrowserDetails
  at: Date
}): MetaServerEvent {
  const e = SERVER_EVENTS[input.kind]
  return {
    event_name: e.name,
    event_time: Math.floor(input.at.getTime() / 1000),
    event_id: e.id(input.order.orderNumber),
    action_source: 'website',
    event_source_url: input.browser.sourceUrl,
    user_data: metaUserData(input.customer, input.browser),
    custom_data: orderCustomData(input.order),
  }
}

// ── Sending and reading Meta's answer ─────────────────────────────────────

export type MetaAnswer =
  | { ok: true; eventsReceived: number; messages: string[]; fbtraceId: string | null }
  | {
      ok: false
      /** Worth trying again later (Meta busy/down, network). */
      retry: boolean
      /** The token is expired or revoked (code 190) — a new one is needed. */
      tokenProblem: boolean
      message: string
      fbtraceId: string | null
    }

/** Graph API codes Meta says are temporary: wait and retry. */
const TEMPORARY_CODES = new Set([1, 2, 4, 17, 341, 368])

/** Turn Meta's HTTP answer into a decision (docs/integrations/meta.md → Answers). */
export function readMetaAnswer(status: number, body: unknown): MetaAnswer {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (status >= 200 && status < 300) {
    return {
      ok: true,
      eventsReceived: typeof o.events_received === 'number' ? o.events_received : 0,
      messages: Array.isArray(o.messages) ? o.messages.map(String) : [],
      fbtraceId: typeof o.fbtrace_id === 'string' ? o.fbtrace_id : null,
    }
  }
  const err = (typeof o.error === 'object' && o.error !== null ? o.error : {}) as Record<
    string,
    unknown
  >
  const code = typeof err.code === 'number' ? err.code : null
  const text =
    (typeof err.error_user_msg === 'string' && err.error_user_msg) ||
    (typeof err.message === 'string' && err.message) ||
    `Meta answered HTTP ${status}`
  return {
    ok: false,
    retry: status >= 500 || status === 429 || (code !== null && TEMPORARY_CODES.has(code)),
    tokenProblem: code === 190,
    message: code !== null ? `${text} (code ${code})` : text,
    fbtraceId: typeof err.fbtrace_id === 'string' ? err.fbtrace_id : null,
  }
}

export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>

/**
 * POST the events to Meta. The token travels as the `access_token` query
 * parameter (Meta's documented way) — so the URL is never logged anywhere.
 * Network failures and time-outs come back as "retry", never as a throw.
 */
export async function sendToMeta(params: {
  pixelId: string
  accessToken: string
  events: MetaServerEvent[]
  testEventCode?: string
  fetch: FetchLike
  /** Defaults to Meta; tests point it at a fake server. */
  baseUrl?: string
  timeoutMs?: number
}): Promise<MetaAnswer> {
  const base = params.baseUrl ?? 'https://graph.facebook.com'
  const url = `${base}/${META_GRAPH_VERSION}/${encodeURIComponent(params.pixelId)}/events?access_token=${encodeURIComponent(params.accessToken)}`
  const body = JSON.stringify({
    data: params.events,
    ...(params.testEventCode && { test_event_code: params.testEventCode }),
  })
  try {
    const res = await params.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(params.timeoutMs ?? 15_000),
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      // not JSON (e.g. a proxy error page) — decided by the status alone
    }
    return readMetaAnswer(res.status, json)
  } catch (e) {
    return {
      ok: false,
      retry: true,
      tokenProblem: false,
      message: `Could not reach Meta: ${e instanceof Error ? e.name : 'network error'}`,
      fbtraceId: null,
    }
  }
}

// The cookie formats live in the browser-safe part (the checkout checks them too).
export { FBC_PATTERN, FBP_PATTERN } from '../meta-cookies.js'
