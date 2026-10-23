// ============================================================================
// Courier booking (Phase 2 — docs/integrations/courier.md).
//
// ADAPTER PATTERN (like payments, CLAUDE.md §9): the order code asks "the
// courier" to book a parcel and never knows which company it is. Each company
// gets one small adapter class that turns OUR fields into ITS API. Swapping
// Steadfast for Pathao later = one new adapter, nothing else changes.
//
// The names here are ours, not Steadfast's: the adapter maps them once its
// official API documentation is in docs/integrations/ (Rule 2 — never guess).
// ============================================================================

/** What we send for one parcel. */
export interface ParcelBooking {
  /** Our order number, e.g. "NW-10001" — the courier prints it and we match by it. */
  invoice: string
  recipientName: string
  /** +8801XXXXXXXXX (as stored on the order). */
  recipientPhone: string
  /** One line: address, area, district — what the rider reads. */
  recipientAddress: string
  /** Taka to collect on delivery: the order total for cash-on-delivery, 0 when already paid. */
  codAmount: number
  /** The customer's delivery note, if any. */
  note: string | null
}

export type BookingResult =
  | { ok: true; consignmentId: string; trackingCode: string; status: string }
  /** retryable: the courier was down or slow (try again later); otherwise it refused the parcel. */
  | { ok: false; retryable: boolean; reason: string }

/**
 * Can "Book with …" be used right now?
 *  - ready:     connected
 *  - no_keys:   the API key / secret key aren't in the server .env
 *  - not_built: keys are there, but this adapter waits for the official docs
 */
export type CourierReadiness = 'ready' | 'no_keys' | 'not_built'

export interface CourierProvider {
  /** Shown to the admin and saved on the order ("Steadfast"). */
  readonly name: string
  readiness(): CourierReadiness
  book(parcel: ParcelBooking): Promise<BookingResult>
}

/** Dependency-injection name: tests replace the real courier with a recording fake. */
export const COURIER = Symbol('COURIER')
