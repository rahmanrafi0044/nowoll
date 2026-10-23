import type { BookingResult, CourierProvider, CourierReadiness, ParcelBooking } from './courier.js'

// ============================================================================
// Steadfast Courier — the real connection (Phase 2, Part B).
// Every name and rule here comes from Steadfast's merchant-dashboard API guide,
// recorded in docs/integrations/courier.md (CLAUDE.md Rule 2 — nothing guessed).
//
//   POST {base}/create_order   headers Api-Key + Secret-Key, JSON body
//   → { status: 200, consignment: { consignment_id, tracking_code, status, … } }
//   a rejected field → { status: 400, errors: { field: [...] } } (HTTP 400/422) — not booked
//   a repeated invoice is refused — so a retry can never book a second parcel
// ============================================================================

export const STEADFAST_BASE_URL = 'https://portal.packzy.com/api/v1'

/** Their storage limits (longer values are cut by them — we cut first, so we know what's kept). */
const LIMIT = { invoice: 100, name: 100, address: 490, note: 480, item: 255 } as const

/** Characters Steadfast replaces with a space in names, addresses and notes. */
const STRIPPED = /[{};<>$]/g

/** How long we wait for an answer before calling it "down" (the admin can try again). */
const TIMEOUT_MS = 20_000

type Fetch = typeof fetch

export class SteadfastCourier implements CourierProvider {
  readonly name = 'Steadfast'

  constructor(
    private readonly keys: { apiKey?: string; secretKey?: string },
    /** Tests pass a fake; production uses the real fetch. */
    private readonly http: Fetch = fetch,
    private readonly baseUrl = STEADFAST_BASE_URL,
  ) {}

  readiness(): CourierReadiness {
    return this.keys.apiKey && this.keys.secretKey ? 'ready' : 'no_keys'
  }

  async book(parcel: ParcelBooking): Promise<BookingResult> {
    const phone = localPhone(parcel.recipientPhone)
    if (!phone)
      return {
        ok: false,
        retryable: false,
        reason: `the phone number ${parcel.recipientPhone} isn't a Bangladeshi mobile number (11 digits starting 01).`,
      }
    if (!/^[A-Za-z0-9_-]+$/.test(parcel.invoice))
      return {
        ok: false,
        retryable: false,
        reason: `the order number ${parcel.invoice} can't be used.`,
      }

    const body = {
      invoice: parcel.invoice.slice(0, LIMIT.invoice),
      recipient_name: clean(parcel.recipientName, LIMIT.name),
      recipient_phone: phone,
      recipient_address: clean(parcel.recipientAddress, LIMIT.address),
      cod_amount: parcel.codAmount,
      ...(parcel.note?.trim() && { note: clean(parcel.note, LIMIT.note) }),
      ...(parcel.itemDescription?.trim() && {
        item_description: clean(parcel.itemDescription, LIMIT.item),
      }),
    }

    let res: Response
    try {
      res = await this.http(`${this.baseUrl}/create_order`, {
        method: 'POST',
        headers: {
          'Api-Key': this.keys.apiKey ?? '',
          'Secret-Key': this.keys.secretKey ?? '',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return { ok: false, retryable: true, reason: 'no answer from Steadfast.' }
    }

    const json = (await res.json().catch(() => null)) as CreateOrderAnswer | null
    const c = json?.consignment
    if (res.ok && json?.status === 200 && c && c.consignment_id != null && c.tracking_code)
      return {
        ok: true,
        consignmentId: String(c.consignment_id),
        trackingCode: String(c.tracking_code),
        status: typeof c.status === 'string' ? c.status : 'in_review',
      }

    // Their table: 429 too many / 5xx their fault → try again later (same invoice = safe).
    if (res.status === 429 || res.status >= 500)
      return { ok: false, retryable: true, reason: `Steadfast is busy (${res.status}).` }
    if (res.status === 401)
      return {
        ok: false,
        retryable: false,
        reason: 'the API keys were not accepted — check them in the server settings.',
      }
    if (res.status === 403)
      return {
        ok: false,
        retryable: false,
        reason: 'the Steadfast account is inactive or its details (KYC) need resubmitting.',
      }
    const fields = fieldErrors(json?.errors)
    return {
      ok: false,
      retryable: false,
      reason: fields || json?.message || `an unexpected answer (${res.status}).`,
    }
  }
}

interface CreateOrderAnswer {
  status?: number
  message?: string
  errors?: unknown
  consignment?: {
    consignment_id?: number | string
    tracking_code?: string
    status?: string
  }
}

/** "+8801712345678" / "8801712345678" / "01712345678" → "01712345678"; anything else → null. */
export function localPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('880') ? `0${digits.slice(3)}` : digits
  return /^01\d{9}$/.test(local) ? local : null
}

/** Their stripped characters become spaces (as they would), spaces tidied, cut to their limit. */
function clean(text: string, max: number): string {
  return text.replace(STRIPPED, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** `{ recipient_phone: ['must be 11 digits'] }` → "recipient_phone: must be 11 digits". */
function fieldErrors(errors: unknown): string {
  if (!errors || typeof errors !== 'object') return ''
  return Object.entries(errors as Record<string, unknown>)
    .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(', ') : String(msg)}`)
    .join('; ')
}
