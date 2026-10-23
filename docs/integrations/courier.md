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

Answered by their docs: duplicate invoices are refused (see below), so our order number is safe as `invoice`.

---

### Steadfast API — from the merchant dashboard (screenshots, 23 Oct 2026)

Source: Steadfast merchant dashboard → **API guide** and **Webhook** pages (Rafi's screenshots, kept
on his PC in `docs/steadfast-docs/`, not in git). Only what those pages show; gaps are TODO.

**Connection**
- Base URL: `https://portal.packzy.com/api/v1`
- Headers on every request: `Api-Key: <api key>`, `Secret-Key: <secret key>`,
  `Content-Type: application/json` on POST. No login step, no token to refresh.
- Keys belong to one profile; several named keys per profile are allowed (one per integration).
- Wrong/missing keys → `401`. After 10 failures in 5 minutes from one address+key → `429` for
  60 minutes, even with correct keys. **Never retry a 401 in a loop.**
- Rate limits: 1,000 requests a minute; 6,000 for booking.
- `GET /ping` — "Are you there?", no keys needed. Call it first when connecting.

**Booking one parcel — `POST /create_order`** (example request on the page):
```json
{ "invoice": "ORD-10231", "recipient_name": "Jahid Hasan", "recipient_phone": "01712345678",
  "recipient_address": "Dhanmondi, Dhaka", "cod_amount": 1060 }
```
- Values are **cut, not refused**, when too long: `invoice` 100, `recipient_name` 100,
  `recipient_phone` 40, `recipient_address` 490, `note` 480 characters → we trim them ourselves.
- They **strip** these characters from address, name and note (replaced with a space):
  `{` `}` `;` `<` `>` `$` — "text you send is not always text you get back".
- **Duplicate invoices are refused**, so a retry with the same invoice cannot book twice (`500`:
  "retry with the same invoice").
- TODO (section folded in the screenshots): the full list of fields (required/optional, e.g.
  delivery type, item description, alternative phone) and **the response** — the exact names of the
  consignment id, tracking code and status in the answer.

**Other endpoints** (18 in all): `/create_order/bulk-order` (up to 500), `.../bulk-order/extended`,
`GET /status_by_cid/{consignment_id}`, `/status_with_return_status_by_cid/{consignment_id}`,
`/status_by_invoice/{invoice}`, `/status_by_trackingcode/{tracking_code}`,
`/trackings_by_invoice/{invoice}`, `POST /create_pickup_request`, `POST /create_return_request`,
`GET /get_return_requests`, `/get_return_request/{id}`, `/get_balance`, `/payments`,
`/payments/{payment_id}`, `/police_stations`, `/fraud_check/score/{phone}`.
Status answers are cached for 60 seconds — "prefer a webhook".

**Delivery statuses**: `pending` (booked, not yet attempted), `in_review` (just created; every parcel
starts here), `hold`, `delivered_approval_pending`, `partial_delivered_approval_pending`,
`cancelled_approval_pending`, `unknown_approval_pending` (anything `_approval_pending` is the rider's
word, **not final**), `delivered` (final; the COD is now owed to us), `partial_delivered` (final),
`cancelled` (final; the parcel comes back), `exceptional` (lost/damaged — contact them), `unknown`.
Return statuses (only from `status_with_return_status_by_cid`): `partial_delivered_return_proccessing`,
`..._rider_assigned`, `..._received`, `cancelled_return_proccessing`, `..._rider_assigned`, `..._received`
(their spelling: "proccessing").

**Response codes**: `200` done (some endpoints report a per-item failure inside a 200 — read the body),
`400` malformed, `401` keys wrong/not yours, `403` inactive account or KYC to resubmit, `422` a field
was rejected (read `errors`), `429` too many, `500` their fault (retry, same invoice).

**Webhook** (dashboard → Webhook): one callback URL for the main account, **https**; they POST JSON
and wait up to **5 seconds** for a 2xx. Optional **auth token** (letters, digits, `- _ . =`), sent as
`Authorization: Bearer <token>` and used to sign: `X-Signature` = HMAC-SHA256 of the **raw body**, hex,
keyed with the token. `Idempotency-Key`: the same value when they retry the same event.
`User-Agent: Steadfast-Webhook/1.0`. Retries: after 30 s and 2 min (3 attempts) on 5xx/no answer;
a 4xx is not retried.
- Events: `delivery_status` (status: pending, delivered, partial_delivered, cancelled or unknown),
  `tracking_update`, `consignment_update`, `return_list_accepted`, `payment_request`,
  `cancel_request`, `return_request`, `pickup_request`, `user_update`.
- `delivery_status` example:
  ```json
  { "notification_type": "delivery_status", "consignment_id": 12345, "invoice": "INV-67890",
    "cod_amount": 1500.0, "status": "delivered", "delivery_charge": 100.0,
    "tracking_message": "Your package has been delivered successfully.",
    "updated_at": "2025-03-02 12:45:30" }
  ```
  (`consignment_id` is a **number** here.) Their example answers `{ "status": "success" }`.

**Our plan from this (Part B)**
- Book: send `invoice` = our order number, the recipient fields, `cod_amount`, `note`; phone in the
  `01XXXXXXXXX` form (as in their example); trim to their limits; strip their stripped characters
  ourselves so what we store matches what they store.
- Webhook at `https://api.nowoll.com/api/v1/webhooks/steadfast`: check `X-Signature` against the raw
  body with the token (secret, `STEADFAST_WEBHOOK_TOKEN` in the server `.env`, constant-time compare),
  ignore repeats by `Idempotency-Key`, answer 2xx within 5 s (work after answering).
  `delivered` → our DELIVERED (+ email); `partial_delivered` / `cancelled` / `exceptional` → flag the
  order for the admin; `_approval_pending` → only shown, never acted on.

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
