import type { BookingResult, CourierProvider, CourierReadiness, ParcelBooking } from './courier.js'

/**
 * Steadfast Courier — PLACEHOLDER (Part A of the Steadfast step).
 *
 * TODO(Steadfast official docs): Steadfast's API reference is only inside the
 * merchant dashboard ("API and plugins"). Rafi is sending it; then:
 *   1. write docs/integrations/courier.md → "Steadfast" from it (endpoints,
 *      headers, field names, statuses, webhook) and have Rafi check it;
 *   2. implement book() against it, with a fake Steadfast in the tests;
 *   3. set `built = true`.
 * Until then nothing is sent anywhere: book() refuses, and the admin page
 * says Steadfast isn't connected yet (manual tracking still works).
 */
export class SteadfastCourier implements CourierProvider {
  readonly name = 'Steadfast'
  private readonly built = false

  constructor(private readonly keys: { apiKey?: string; secretKey?: string }) {}

  readiness(): CourierReadiness {
    if (!this.keys.apiKey || !this.keys.secretKey) return 'no_keys'
    return this.built ? 'ready' : 'not_built'
  }

  async book(_parcel: ParcelBooking): Promise<BookingResult> {
    return {
      ok: false,
      retryable: false,
      reason:
        'The Steadfast connection isn’t finished yet (it waits for Steadfast’s official API documentation). Book in the Steadfast app and enter the tracking number by hand.',
    }
  }
}
