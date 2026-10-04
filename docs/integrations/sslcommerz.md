# SSLCommerz Integration Contract

## Overview
SSLCommerz is Bangladesh's leading payment gateway. Nowoll uses it for card payments and mobile banking (bKash, Nagad, Rocket via SSLCommerz).

**Sandbox dashboard:** https://sandbox.sslcommerz.com/manage/
**Live dashboard:** https://manage.sslcommerz.com/manage/
**Official docs:** https://developer.sslcommerz.com/

---

## Credentials (stored in env vars — never hardcoded)

```env
SSLCOMMERZ_STORE_ID=       # from SSLCommerz merchant dashboard
SSLCOMMERZ_STORE_PASSWORD= # from SSLCommerz merchant dashboard
SSLCOMMERZ_IS_LIVE=false   # set to true in production only
```

## API Endpoints

| Environment | Session URL |
|---|---|
| Sandbox | `https://sandbox.sslcommerz.com/gwprocess/v4/api.php` |
| Live | `https://securepay.sslcommerz.com/gwprocess/v4/api.php` |

| Environment | Validation URL |
|---|---|
| Sandbox | `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php` |
| Live | `https://securepay.sslcommerz.com/validator/api/validationserverAPI.php` |

---

## Flow

```
Customer clicks "Pay"
        ↓
Frontend calls POST /api/v1/payment/sslcommerz/init
        ↓
NestJS creates order in DB (status: PENDING)
        ↓
NestJS calls SSLCommerz Session API
        ↓
SSLCommerz returns GatewayPageURL
        ↓
NestJS returns { gateway_url } to frontend
        ↓
Frontend redirects browser to GatewayPageURL
        ↓
Customer pays on SSLCommerz page
        ↓
SSLCommerz POSTs IPN to /api/v1/payment/sslcommerz/ipn
        ↓
NestJS validates IPN with SSLCommerz Validation API
        ↓
If VALID → update order to PAID, send confirmation email
If INVALID → cancel order, restore stock
        ↓
SSLCommerz redirects browser to success/fail/cancel URL
```

---

## Session Init Payload (POST to Session URL)

```typescript
{
  store_id: string,               // SSLCOMMERZ_STORE_ID
  store_passwd: string,           // SSLCOMMERZ_STORE_PASSWORD
  total_amount: number,           // order total in BDT
  currency: 'BDT',
  tran_id: string,                // USE ORDER ID — must be unique per transaction
  success_url: string,            // https://api.nowoll.com/api/v1/payment/sslcommerz/success
  fail_url: string,               // https://api.nowoll.com/api/v1/payment/sslcommerz/fail
  cancel_url: string,             // https://api.nowoll.com/api/v1/payment/sslcommerz/cancel
  ipn_url: string,                // https://api.nowoll.com/api/v1/payment/sslcommerz/ipn
  cus_name: string,               // customer full name
  cus_email: string,              // customer email
  cus_phone: string,              // customer phone (e.g. +8801700000000)
  cus_add1: string,               // address line 1
  cus_city: string,               // district
  cus_country: 'Bangladesh',
  shipping_method: 'Courier',
  product_name: 'Clothing',
  product_category: 'Clothing',
  product_profile: 'general',
}
```

Response: `{ status: 'SUCCESS', GatewayPageURL: 'https://...' }`

---

## IPN Payload (SSLCommerz POSTs to your ipn_url)

Key fields:
```
tran_id       — matches your order ID
val_id        — use this to validate with SSLCommerz validation API
status        — 'VALID' | 'INVALID' | 'CANCELLED' (DO NOT trust this alone)
amount        — verify this matches your order total
currency      — should be 'BDT'
```

**CRITICAL:** Always validate the IPN with the SSLCommerz Validation API using `val_id`. Never mark an order as paid based on the IPN payload's `status` field alone — it can be spoofed.

---

## IPN Validation (GET to Validation URL)

```
GET https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php
  ?val_id={val_id from IPN}
  &store_id={SSLCOMMERZ_STORE_ID}
  &store_passwd={SSLCOMMERZ_STORE_PASSWORD}
  &format=json
```

Response: `{ status: 'VALID' | 'INVALID', amount: number, ... }`

Only proceed if `status === 'VALID'` AND `amount === order.total_amount`.

---

## Redirect Handlers

SSLCommerz redirects the browser (GET or POST) to:
- `success_url` — payment completed (still must verify via IPN — do not use this as payment proof)
- `fail_url` — payment failed
- `cancel_url` — customer cancelled

These handlers should redirect the user to the appropriate frontend page:
- Success → `https://nowoll.com/checkout/success?orderId={tran_id}`
- Fail/Cancel → `https://nowoll.com/checkout?error=payment_failed`

---

## Adapter Interface

```typescript
// packages/payments/src/sslcommerz.adapter.ts
export interface SSLCommerzInitParams {
  orderId: string;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
}

export interface SSLCommerzInitResult {
  success: boolean;
  gatewayUrl?: string;
  error?: string;
}

export interface SSLCommerzValidateResult {
  valid: boolean;
  amount?: number;
  valId?: string;
}
```

---

## Error Handling

- If SSLCommerz Session API returns `status !== 'SUCCESS'` → throw error, do not redirect customer
- If IPN arrives for unknown order ID → log and return 200 (do not error — SSLCommerz will retry)
- If validation API is unreachable → mark payment as `UNDER_REVIEW` and alert admin — do not auto-cancel
- All IPN payloads must be stored in `payments.raw_response` for audit

---

## Testing (Sandbox)

Sandbox test card:
- Card number: `4111111111111111`
- Expiry: any future date
- CVV: any 3 digits
- OTP: `123456`

Sandbox credentials available at: https://developer.sslcommerz.com/registration/

---

*Claude Code: never implement SSLCommerz calls without reading this file. Never invent field names. If you find a discrepancy between this doc and the official SSLCommerz docs, update this file and notify Rafi.*
