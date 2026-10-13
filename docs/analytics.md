# Analytics — what the numbers mean

**Code:** `apps/api/src/analytics` · **Shapes:** `packages/types/src/analytics.ts` ·
**Used by:** the admin dashboard (step 29b) and the analytics page (step 41).
Read-only: no analytics request ever changes data. Every answer is `Cache-Control: no-store`.

## One rule for a sale

An order is a **sale** when its status is **Confirmed, Processing, Shipped or Delivered**. It is counted on
the **day it was placed** (not the day it was delivered). Not sales: **Pending** (a COD order nobody has
confirmed by phone yet, or an online order not paid), **Cancelled**, **Returned**. Refunds are not subtracted.

## Days are Bangladesh days

Every day is a calendar day in **Asia/Dhaka** time: an order at 00:30 on 6 October in Dhaka (18:30 UTC on the
5th) belongs to 6 October. A period is whole days, both ends included.

## Choosing the period (every endpoint)

`?days=30` — the last 30 days, today included · or `?from=2026-09-01&to=2026-09-30`.
Both from and to, or neither; real dates; from ≤ to; at most **366 days**.
"Previous period" = the same number of days just before (1–30 Sep → 2–31 Aug).

## The endpoints

| Route | Who | Answers |
|---|---|---|
| `GET /analytics/summary` | Admin + Staff | today, last 7 days vs the 7 before, average order, new accounts, "needs attention" |
| `GET /analytics/revenue` | Admin + Staff | sales per day (empty days = 0); chart points by **day** up to 92 days, else **7-day blocks** from the first day (`groupBy=month` for calendar months); totals; previous period |
| `GET /analytics/top-products?limit=5` | Admin + Staff | best sellers by units, then money; deleted products kept by the name on the order |
| `GET /analytics/top-categories?level=category\|top&limit=10` | **Admin** | units and money per category ("Men > Shirts"), or rolled up to the top level ("Men"); hidden categories still count; deleted products → "Unknown category"; total of all categories + previous period's |
| `GET /analytics/customers?limit=10` | **Admin** | buyers in the period, new (first purchase ever) vs returning, repeat rate (2+ orders), top spenders |
| `GET /analytics/orders` | **Admin** | every order **placed** in the period and where it is now (sale / delivered / pending / cancelled / returned), cancellation rate, sales by payment method and delivery zone |

## Which money

- **Sales / revenue / spent** = the order **total** the customer pays (products − discount + delivery + VAT).
- **Products and categories** = **line totals** (price × quantity) — *before* order-level discounts and without
  delivery, so they don't add up to "sales". The page labels them "product sales".
- Categories are the product's category **now** (moving a product moves its past sales with it).

## Customers

A customer is an **email address** (lower-case), so guests count. "New" = their first sale ever is in the
period. Top spenders show only name (from their latest order), email, order count and total — never address
or phone.
