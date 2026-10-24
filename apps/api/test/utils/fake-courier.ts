import type {
  BookingResult,
  CourierProvider,
  CourierReadiness,
  ParcelBooking,
} from '../../src/courier/courier.js'

/**
 * The courier in tests (Phase 2): never books a real parcel. Remembers every
 * booking; `readyAs` and `answer` decide how it behaves. `delayMs` keeps a
 * booking "in progress" (to test two clicks at once).
 */
export class FakeCourier implements CourierProvider {
  readonly name = 'Steadfast'
  readonly booked: ParcelBooking[] = []
  readyAs: CourierReadiness = 'ready'
  answer: BookingResult | null = null
  delayMs = 0
  private n = 0

  readiness(): CourierReadiness {
    return this.readyAs
  }

  async book(parcel: ParcelBooking): Promise<BookingResult> {
    this.booked.push(parcel)
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs))
    if (this.answer) return this.answer
    this.n += 1
    return {
      ok: true,
      consignmentId: `C-${this.n}`,
      trackingCode: `SF-TRACK-${this.n}`,
      status: 'in_review',
    }
  }

  reset() {
    this.booked.length = 0
    this.readyAs = 'ready'
    this.answer = null
    this.delayMs = 0
  }
}
