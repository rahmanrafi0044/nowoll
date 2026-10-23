# Courier Integration Contract

## Overview
Nowoll uses Bangladesh domestic courier services for order delivery.

**Phase 1 (launch):** Manual courier booking — admin enters tracking number manually in the admin panel after booking via the courier's own app/website.

**Phase 2 (post-launch):** API integration with Pathao Commerce or Steadfast Courier.

---

## Phase 1 — Manual Flow

1. Order status updated to `PROCESSING` by admin
2. Admin books delivery via courier's app (Pathao, Steadfast, Paperfly, etc.)
3. Admin copies tracking number
4. Admin opens order in Nowoll admin panel → enters courier name + tracking number → saves
5. Order status updates to `SHIPPED`
6. System sends "Shipped" email to customer with courier name and tracking number

**Fields required:** `courier_name` (text) + `tracking_number` (text) on the `orders` table

No API integration required for Phase 1.

---

## Phase 2 — Steadfast Courier (in progress, October 2026)

Rafi's choice: **Steadfast first** (he has a merchant account). Two parts:

**Part A — built (no Steadfast API calls yet):**
- `apps/api/src/courier/courier.ts` — OUR courier contract (adapter pattern, like payments):
  `book(parcel) → { consignmentId, trackingCode, status }` or a refusal (`retryable` = down/slow).
  Our own field names: `invoice` (order number), `recipientName`, `recipientPhone`,
  `recipientAddress`, `codAmount`, `note`. The adapter maps them to Steadfast's.
- `apps/api/src/courier/steadfast.courier.ts` — **placeholder**: `readiness()` is `no_keys`
  without both keys, else `not_built`; `book()` always refuses. Nothing is sent anywhere.
- Admin order page → "Mark shipped" → **Book with Steadfast** (POST `/orders/:id/courier`):
  - decision **1A**: booking = the order becomes SHIPPED with the tracking code, customer emailed;
  - decision **2A**: amount to collect = the order total for an unpaid COD order, ৳0 when paid;
  - the order row stays locked while the courier answers → two clicks = one parcel;
  - refused / courier down → nothing changes, the reason is shown; manual tracking always stays.
- Orders: `courier_consignment_id`, `courier_status`, `courier_status_at` (migration
  `order_courier_booking`).
- Admin → Settings → Delivery: `steadfast_enabled` (off by default).
- Keys: `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` — server `.env` ONLY (Rules 3 and 9).
- Tests: `apps/api/test/courier-booking.e2e-spec.ts` with a fake courier (`test/utils/fake-courier.ts`).

**Part B — waiting for Steadfast's official API documentation** (it's only inside the merchant
dashboard → "API and plugins"; Rafi sends it, WITHOUT the keys). Then, from that document only:
1. Write here: base URL, how the keys are sent, the create-order endpoint and its exact fields,
   the response (consignment id, tracking code, status), all status values, and whether Steadfast
   calls us back (webhook) or we ask (status by consignment id / invoice / tracking code).
2. Implement `SteadfastCourier.book()` + a fake Steadfast for the tests; set `built = true`.
3. Delivery updates: delivered → DELIVERED (+ email), returned/cancelled → flag for the admin.
4. One real test parcel with Rafi.

TODO: confirm with Steadfast — is our order number accepted as their `invoice` (unique per
merchant)? Does booking the same invoice twice create two parcels?

---

## Phase 2b — Pathao Commerce API (later, not started)

**Status:** NOT IMPLEMENTED YET — do not write any Pathao API code until Rafi provides:
- Official Pathao Commerce API documentation URL
- Merchant account credentials
- Webhook secret

**Placeholder adapter:**
```typescript
// packages/shipping/src/pathao.adapter.ts
// TODO: Implement after receiving Pathao Commerce API documentation and credentials
// Contact: Pathao merchant support

export class PathaoAdapter implements CourierProvider {
  async createDelivery(params: DeliveryParams): Promise<DeliveryResult> {
    throw new Error('Pathao integration not yet implemented. Use manual tracking.');
  }
}
```

---

## Courier Provider Interface

> **Superseded (Phase 2):** the contract in use is `apps/api/src/courier/courier.ts` (see above).
> The sketch below is the original Phase 1 idea, kept for history.

```typescript
// packages/shipping/src/types.ts
export interface CourierProvider {
  createDelivery(params: DeliveryParams): Promise<DeliveryResult>
  trackDelivery(trackingId: string): Promise<TrackingResult>
  cancelDelivery(trackingId: string): Promise<void>
}

export interface DeliveryParams {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  district: string;
  division: string;
  itemWeight?: number;    // grams
  itemDescription: string;
  cashOnDelivery?: number; // BDT amount if COD
}

export interface DeliveryResult {
  success: boolean;
  trackingId?: string;
  estimatedDelivery?: string;
  error?: string;
}
```

---

## Shipping Zones

```
DHAKA       — Dhaka city and metropolitan area
OUTSIDE_DHAKA — All other districts in Bangladesh
INTERNATIONAL — Outside Bangladesh (future, not in scope for v1)
```

Rates are configurable per zone from the admin panel. Do not hardcode.

---

*Claude Code: never write a courier's API calls from memory, blogs or unofficial SDKs — only from the courier's official documentation recorded in this file (CLAUDE.md Rule 2). The manual flow always stays as the fallback.*
