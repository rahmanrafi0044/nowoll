# SSLCommerz Integration Contract

## Overview
SSLCommerz is Bangladesh's leading payment gateway. Nowoll uses it for card payments and mobile banking (bKash, Nagad, Rocket via SSLCommerz).

**Sandbox dashboard:** https://sandbox.sslcommerz.com/manage/
**Live dashboard:** https://manage.sslcommerz.com/manage/
**Official docs (source of truth):** https://developer.sslcommerz.com/doc/v4/
**Sandbox registration (free, instant credentials):** https://developer.sslcommerz.com/registration/

**Code:** `packages/payments/src/sslcommerz.adapter.ts` (implements `PaymentProvider`, CLAUDE.md §9).
**Last checked against the official v4 docs:** October 2026 (Phase 3 step 19).

### What changed in the October 2026 check
The first version of this file was written before the official docs were read. Corrections:

| Topic | Old | Official v4 |
|---|---|---|
| Session request format | JSON object | `application/x-www-form-urlencoded` POST |
| Required customer fields | name, email, phone, address, city | + **`cus_postcode`** |
| Shipping | `shipping_method: 'Courier'` | `YES` / `NO` / `Courier` / `SSLCOMMERZ_LOGISTIC`; `ship_*` fields required when `YES` |
| IPN `status` values | VALID / INVALID / CANCELLED | VALID, **FAILED**, CANCELLED, **EXPIRED**, **UNATTEMPTED** |
| Validation "paid" status | only `VALID` | `VALID` **or `VALIDATED`** (already validated earlier — e.g. IPN and redirect both validate) |
| Amount limits | — | **৳10.00 – ৳500,000.00** per payment |
| Risk | — | `risk_level = 1` → verify before delivering |
| Refunds | — | Refund API; requires our server IP to be **registered with SSLCommerz** |
| Lookup by our id | — | Transaction query API (by `tran_id`) |

---

## Credentials (root `.env` — never committed)

```env
SSLCOMMERZ_STORE_ID=       # from the SSLCommerz dashboard (sandbox or live)
SSLCOMMERZ_STORE_PASSWORD= # from the SSLCommerz dashboard
SSLCOMMERZ_IS_LIVE=false   # "true" ONLY on the real shop
```

- Development: may be left as placeholders — "Pay online" then reports "not set up".
- **Production: the API refuses to start without real values** (`apps/api/src/config/env.validation.ts`).
- The store password is sent only to SSLCommerz and **never** appears in logs, errors or stored responses.

## Endpoints

| Purpose | Method | Sandbox | Live |
|---|---|---|---|
| Create session | POST (form) | `https://sandbox.sslcommerz.com/gwprocess/v4/api.php` | `https://securepay.sslcommerz.com/gwprocess/v4/api.php` |
| Validate a payment | GET | `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php` | `https://securepay.sslcommerz.com/validator/api/validationserverAPI.php` |
| Query by `tran_id` / refund | GET | `https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php` | `https://securepay.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php` |

TLS 1.2 or newer is required (Node's `fetch` uses it by default). Our requests time out after 10 s.

---

## Flow

**Code:** `apps/api/src/payments/` (step 20) — `payments.service.ts` holds every rule below.

```
Customer clicks "Place order and pay"                       (storefront)
        ↓
POST /api/v1/orders → order PENDING, stock reserved,        (step 18)
                      first payment attempt PENDING, tran_id "NW10001-7F3A9C"
        ↓
POST /api/v1/payment/sslcommerz/init {orderId} → createPayment()   (5/min)
  first "Pay" sends the attempt made with the order; every later "Pay"
  ("Try paying again") creates a NEW attempt with a new tran_id
        ↓
SSLCommerz returns GatewayPageURL → browser is sent there (storefront only
follows https://*.sslcommerz.com links)
        ↓
Customer pays on SSLCommerz's page
        ↓
SSLCommerz POSTs the IPN to /api/v1/payment/sslcommerz/ipn   (server → server, never rate-limited)
        ↓
payload stored (payment_events) → verifyPayment(val_id) — the Validation API decides,
NEVER the IPN's own "status"
        ↓
PAID        → payment PAID; order CONFIRMED + PAID
REVIEW      → payment + order UNDER_REVIEW (risky — a human checks before shipping)
UNREACHABLE → payment + order UNDER_REVIEW, val_id kept empty → re-checked every 5 min
NOT_PAID    → recorded only; then the transaction query (by tran_id) is asked:
              FAILED → this attempt FAILED. The ORDER stays open for another try.
        ↓
SSLCommerz also POSTs the browser to success / fail / cancel → we answer 303 to
  {site}/checkout/success?order=…          (success is ALSO validated — whichever of
  {site}/checkout/payment-failed?order=…&reason=fail|cancel   IPN/redirect comes first wins;
  {site}/checkout?payment=error            (unknown tran_id)   the other is a no-op)
```

### Special cases (step 20 decisions)

| Case | What happens |
|---|---|
| Paid twice (two tabs) | First confirms the order; the second payment → `UNDER_REVIEW` "duplicate — refund this one" (note on the order) |
| Paid after the order was cancelled | Order stays `CANCELLED` (stock is not re-taken); payment and order payment status → `UNDER_REVIEW` "refund or restore" |
| Risky (`risk_level = 1`) | `UNDER_REVIEW`; never auto-cancelled |
| Validation API unreachable | `UNDER_REVIEW` with no `val_id`; `reconcile()` asks the transaction query every 5 min → PAID: validated and settled; FAILED/not found: attempt FAILED, order back to unpaid |
| Failure / cancel reported | Believed only once the transaction query says FAILED; if it says paid, the payment is validated and settled instead |
| Refunds | Through returns (step 25) — see "How refunds are used" below |

### Unpaid online orders expire

After `payment_timeout_minutes` (setting, default 30), counted from the order **or its latest "Pay" press**,
whichever is later (`apps/api/src/orders/order-expiry.service.ts`, every 5 min). Before cancelling, every
attempt that was sent is looked up by `tran_id`: paid → confirmed instead; SSLCommerz not answering → skipped
until the next round. "Pay" is refused (`ORDER_EXPIRED`) once the window has passed.

### Environment

`API_PUBLIC_URL` (e.g. `https://api.nowoll.com`) builds the four callback URLs; `NEXT_PUBLIC_SITE_URL`
builds the redirects back to the shop. Both must be `https://` in production (the API refuses to start).
In development SSLCommerz can't reach `localhost` — testing real IPNs needs a public tunnel (ask first).

---

## Create session (POST, form-encoded)

| Field | Value we send |
|---|---|
| `store_id`, `store_passwd` | credentials |
| `total_amount` | order total, `decimal(10,2)` e.g. `1550.00` — must be **10.00–500,000.00** |
| `currency` | `BDT` |
| `tran_id` | the payment attempt's `transactionId`: `NW<order number>-<6 random hex>`, e.g. `NW10001-7F3A9C` (14 chars; SSLCommerz allows ≤ 30). Unique per attempt — a retry gets a new attempt and id. |
| `success_url`, `fail_url`, `cancel_url`, `ipn_url` | `https://api.nowoll.com/api/v1/payment/sslcommerz/{success,fail,cancel,ipn}` |
| `cus_name`, `cus_email`, `cus_add1`, `cus_city`, `cus_phone` | from the order (text fields ≤ 50 chars, phone ≤ 20) |
| `cus_postcode` | customer's postcode, or `0000` if none — **TODO: confirm with SSLCommerz support that this is acceptable** |
| `cus_country` | `Bangladesh` |
| `shipping_method` | `YES` |
| `num_of_item` | number of items |
| `ship_name`, `ship_add1`, `ship_city`, `ship_postcode`, `ship_country` | the delivery address (postcode as above) |
| `product_name` | product names, comma-separated (≤ 255) |
| `product_category` | `clothing` |
| `product_profile` | `physical-goods` |

**Response:** `status` (`SUCCESS`/`FAILED`), `failedreason`, `sessionkey`, `GatewayPageURL` (+ banners/gateway lists we don't use).
`status !== SUCCESS` → don't redirect; show `failedreason`.

---

## IPN (SSLCommerz → our `ipn_url`, POST)

Fields we use: `tran_id`, `val_id`, `amount`, `currency`, `status` (VALID / FAILED / CANCELLED / EXPIRED / UNATTEMPTED).
Also present: `store_amount`, `bank_tran_id`, `card_type`, `card_no` (masked), `card_brand`, `risk_level`, `risk_title`, `verify_sign`, `verify_key`, `value_a`–`value_d`.

**CRITICAL:** the IPN's `status` is never trusted — anyone can POST a fake IPN. Only the Validation API (below) decides.
**Every IPN payload is stored** (`payment_events`) for audit, including IPNs for unknown `tran_id`s (log, answer 200 so SSLCommerz stops retrying).

`verify_sign` / `verify_key` (an HMAC-style signature): **not used** — the official page doesn't document the exact recipe and we don't guess (Rule 2). The Validation API is the authoritative check.

---

## Validation API (GET) — the security check

Query: `val_id`, `store_id`, `store_passwd`, `format=json`, `v=1`.

A payment counts as **PAID** only if **all** of these hold (`verifyPayment()`):
1. `status` is `VALID` **or** `VALIDATED`
2. `tran_id` equals our transaction id
3. `amount` equals our amount **to the poisha** (compared as integers)
4. currency (`currency_type`, else `currency`) is `BDT`

Then: `risk_level = 1` → **REVIEW** (payment `UNDER_REVIEW`; a human checks before shipping). Otherwise **PAID**.
`INVALID_TRANSACTION` or any mismatch → **NOT_PAID**. API unreachable → **UNREACHABLE** (never guessed).

---

## Transaction query by `tran_id` (GET)

Query: `tran_id`, `store_id`, `store_passwd`, `format=json`.
Response: `no_of_trans_found`, `element[]` with `status` VALID / VALIDATED / PENDING / FAILED.
Used to reconcile when an IPN never arrived (`getStatus()`).

## Refund API (GET)

Query: `bank_tran_id`, `refund_trans_id` (our unique id, ≤ 30), `refund_amount` (decimal(10,2)), `refund_remarks`, `store_id`, `store_passwd`, optional `refe_id`, `format=json`.
Response: `APIConnect` (INVALID_REQUEST / FAILED / INACTIVE / DONE), `bank_tran_id`, `trans_id`, `refund_ref_id`, `status` (success / failed / processing), `errorReason`.
Refund status query: `refund_ref_id`, `store_id`, `store_passwd` → `refunded` / `processing` / `cancelled`.

Refund status query (official "Query Refund Status", same endpoint): `refund_ref_id`, `store_id`, `store_passwd` → `APIConnect`, `bank_tran_id`, `tran_id`, `refund_ref_id`, `initiated_on`, `refunded_on`, `status` = `refunded` / `processing` / `cancelled`, `errorReason`.
**TODO (launch):** confirm in the sandbox that `format=json` is accepted on the status query (documented only for the refund request). If not, our code reports "unreachable" and simply asks again — nothing is guessed.

**Requires the server's public IP to be registered with SSLCommerz** → launch checklist. So a real sandbox refund **cannot** be tested from a development computer.

### How refunds are used (step 25 — `apps/api/src/returns/refunds.service.ts`)
- Triggered by a **return**, after the parcel is received (admin). `refund_trans_id` = `RF<order number>-<6 hex>`; `refe_id` = our refund record's id.
- **Never more than paid minus already refunded** — refunds still in progress count. Checked with the payment row **locked** (two refunds can't overspend; proven by a lock test).
- The refund is **recorded before** SSLCommerz is called; the call is outside any database transaction.
- `success` → PROCESSED. `processing` → PENDING with `refund_ref_id`; re-checked every 15 minutes.
  `failed` (SSLCommerz clearly refused) → FAILED; trying again is safe.
- **No answer at all → stays PENDING ("unknown")** and blocks another attempt: retrying with a NEW `refund_trans_id`
  could pay twice. An admin checks the SSLCommerz panel and resolves it (refunded / failed).
- Cash-on-delivery orders: refunded by hand (bKash/bank) and recorded as MANUAL with a short reference — no account numbers stored.

---

## Error handling

- Session API `status !== SUCCESS` → don't redirect; show the reason; the order stays unpaid (expires after the timeout).
- IPN for an unknown order → log + store the payload, answer 200.
- Validation API unreachable → payment `UNDER_REVIEW` + logged alert (admin email: Phase 4). **Never auto-cancel** on an unreachable validator.
- All IPN/redirect payloads, validation responses and transaction-query answers are stored (`payment_events`) for audit.

## Testing

- **Automated:** `packages/payments` tests use a fake SSLCommerz (official response shapes) — no network, no money.
  The API's tests always replace SSLCommerz with `apps/api/test/utils/fake-payment-gateway.ts` (forged IPNs, duplicates, late and risky payments, outages).
- **Sandbox connection check:** `pnpm payments:sandbox-check` creates one ৳10 **sandbox** session (refuses to run if `SSLCOMMERZ_IS_LIVE=true`; never pays it).
- **Sandbox run (5 Oct 2026, real sandbox, real browser, our real API + storefront):**
  | Case | Result |
  |---|---|
  | Pay with test card → OTP "Success" | order CONFIRMED + PAID — only after our own validation API call (stored `val_id`, bank id, card type) |
  | OTP "Success with risk" | payment + order `UNDER_REVIEW`, admin note "Flagged risky by SSLCommerz: Not Safe" |
  | OTP "Failed" | attempt FAILED (confirmed by the transaction query); order stays open; "Try paying again" |
  | "Try paying again" → Success | new `tran_id` accepted by the gateway; order PAID |
  | **IPN only** (browser blocked from coming back; API reachable through a temporary Cloudflare quick tunnel) | order PAID from the IPN alone |
  | Forged IPN from the internet (`status=VALID`, made-up `val_id`) | answered 200, validation said `INVALID_TRANSACTION`, order unchanged |

  The sandbox's OTP page has three buttons — **Success**, **Success with risk**, **Failed** — to choose the outcome.
  Without a tunnel everything except the IPN can be tested locally: SSLCommerz sends the *browser* back to
  `API_PUBLIC_URL`, and a browser on the same computer can reach `localhost`.
- **Sandbox test card:** `4111111111111111`, any future expiry, any 3-digit CVV, OTP `123456` (from SSLCommerz's sandbox docs — re-check there if it stops working).

---

*Claude Code: never implement SSLCommerz calls without reading this file. Never invent field names. If this file and the official docs disagree, update this file (with a row in "What changed") and tell Rafi.*
