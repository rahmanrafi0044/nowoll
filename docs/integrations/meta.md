# Meta Contract — Pixel, Conversions API, catalog, domain verification

**Code:** `packages/analytics` (event builders) · `apps/storefront/src/components/tracking/*` (step 39a) ·
Conversions API worker (step 39b) · catalog feed (step 39c).
**Checked against the official docs:** October 2026 (step 39). Consent rules are in [analytics.md](./analytics.md) —
the Pixel needs the customer's **Marketing** consent.

| Topic | Official source |
|---|---|
| Pixel base code | https://developers.facebook.com/docs/meta-pixel/get-started |
| Standard events | https://developers.facebook.com/docs/meta-pixel/reference |
| Deduplication (Pixel + Conversions API) | https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events |
| Conversions API | https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api |
| Customer data parameters (hashing) | https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters |
| `fbp` / `fbc` | https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc |
| Catalog feed fields | https://www.facebook.com/business/help/120325381656392 |
| Domain verification | https://www.facebook.com/business/help/321167023127050 |
| Events endpoint (response fields) | https://developers.facebook.com/docs/marketing-api/reference/ads-pixel/events/ |
| Graph API errors | https://developers.facebook.com/docs/graph-api/guides/error-handling |
| Conversions API troubleshooting | https://developers.facebook.com/docs/marketing-api/conversions-api/support |

## 1. Pixel (browser) — step 39a

**ID:** Admin → Settings → Marketing and tracking → "Meta Pixel ID" (digits only, e.g. `123456789012345`).
Found in Events Manager → Data sources → your dataset.

Official base code (loaded with `next/script`, only after Marketing consent):

```js
!function(f,b,e,v,n,t,s){…}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '<PIXEL_ID>');
fbq('track', 'PageView');
```

The `<noscript>` image (`https://www.facebook.com/tr?id=…&ev=PageView&noscript=1`) is **not** used: without
JavaScript the consent banner can't run, so no tracking may happen. `PageView` is sent again on every
route change (Next.js changes pages without reloading).

### Standard events we send

| When | Event | `custom_data` |
|---|---|---|
| Product page opened | `ViewContent` | `content_ids: [productId]`, `content_type: 'product_group'`, `content_name`, `value`, `currency` |
| "Add to bag" | `AddToCart` | `content_ids: [sku]`, `content_type: 'product'`, `contents: [{id, quantity, item_price}]`, `value`, `currency` |
| Checkout opened | `InitiateCheckout` | `content_ids`, `contents`, `content_type: 'product'`, `num_items`, `value`, `currency` |
| Order placed (COD) / paid (online) | `Purchase` | as above + `order_id`; `value` and `currency` are **required** |

IDs match the catalog (section 4): a variant's **SKU** is the catalog `id`, and the product's id is the
catalog `item_group_id` — that's why `ViewContent` (a whole product) uses `product_group`.

Currency is always `BDT`.

### Event IDs (deduplication)

Each event gets an `eventID`, passed as the **4th argument**: `fbq('track', 'Purchase', {…}, { eventID })`.
When the Conversions API (39b) sends the same event, it uses the same `event_id` + `event_name`; Meta keeps
one if both arrive within 48 hours. `Purchase` uses `purchase-<order number>` (e.g. `purchase-NW-10001`), so
the server can build the same ID without the browser. Other events use a random ID.

## 2. Conversions API (server) — step 39b

`POST https://graph.facebook.com/v25.0/<PIXEL_ID>/events?access_token=<token>` with
`{ data: [ …events ], test_event_code? }` — up to 1000 events; **one invalid event rejects the whole batch**.

| Field | Rule |
|---|---|
| `event_name` | `Purchase`, … or a custom name (`OrderDelivered`) |
| `event_time` | Unix **seconds**; older than 7 days → the whole request fails |
| `event_id` | same as the Pixel's `eventID` |
| `action_source` | `website` |
| `event_source_url` | required for `website` events |
| `user_data` | see below; at least one identifier |
| `custom_data` | `value`, `currency`, `content_ids`, `content_type`, `contents`, `num_items`, `order_id` |

`user_data` — **SHA-256, lowercase hex** after normalising: `em` (trim + lowercase), `ph` (digits only,
with country code: `8801…`), `fn`/`ln` (lowercase, no punctuation), `ct` (lowercase, no spaces), `zp`,
`country` (`bd`), `external_id` (recommended). **Not hashed:** `client_ip_address`, `client_user_agent`,
`fbp`, `fbc`.

`fbp` = the `_fbp` cookie (`fb.1.<ms>.<random>`). `fbc` = the `_fbc` cookie, or built from the `fbclid`
in the landing URL as `fb.1.<ms>.<fbclid>` (fbclid is case-sensitive — never change it).

`client_user_agent` is required for `website` events (Meta's troubleshooting notes: events without a real
browser name may not show), so we always send the browser name saved at checkout.

### Answers (checked October 2026, step 39b)

- **Success (HTTP 2xx):** `{ "events_received": 1, "messages": [], "fbtrace_id": "…" }`. `messages` holds
  warnings. Accepted events can take up to 20 minutes (Test Events) or longer (reports) to show.
- **Error (HTTP 4xx/5xx):**
  `{ "error": { "message", "type", "code", "error_subcode", "error_user_title", "error_user_msg", "fbtrace_id" } }`.
  - Temporary — wait and retry: codes **1, 2, 4, 17, 341, 368**, any HTTP 5xx, network errors.
  - **190** — the access token expired or was revoked: make a new one (retrying won't help).
  - Anything else (e.g. **100** invalid parameter) — the event itself is wrong: logged, not retried.
- There is no fixed rate limit for this API. Meta recommends sending events within an hour of them happening.

### `test_event_code`

Events Manager → your dataset → **Test events** → "Confirm your server's events are set up correctly" shows a code
like `TEST12345`. Events sent with it appear live in that window. **They are not dropped** — they still count
for measurement — so the code is used only by the admin's "Send test event" button, never on real orders.

### How Nowoll uses it (step 39b)

| When | Event | `event_id` |
|---|---|---|
| Cash-on-delivery order placed | `Purchase` | `purchase-NW-10001` (same as the browser's Pixel event → Meta keeps one) |
| Online payment confirmed | `Purchase` | `purchase-NW-10001` |
| Admin marks the order Delivered | `OrderDelivered` (custom) | `delivered-NW-10001` |

- Only for customers who allowed **Marketing** in the cookie banner. At checkout the browser then sends its
  consent, the `_fbp`/`_fbc` cookies and the page address; the API adds the IP address and browser name and keeps
  them in `order_tracking` — **deleted 60 days after the order**. Without consent nothing is stored or sent.
- Customer details come from the order and are **hashed on our server** before sending (`external_id` = hash of
  the email). The log (`meta_events`) keeps no customer details — order number, event, result, Meta's message.
- Sent by a background worker (`marketing` queue, run in the notification worker): 5 tries for temporary
  errors; an event that would be older than 7 days is skipped and logged.

### Getting the access token (Rafi, once)

1. **Business Settings → Users → System users → Add** (name "Nowoll server", role *Admin*).
2. **Add assets** → Pixels/Datasets → your Pixel → *Manage* (full control).
3. **Generate new token** → choose the app (create a simple *Business* app if asked) → token expiry
   **Never** → permissions `ads_management` and `business_management`. (Simpler alternative: Events Manager →
   your dataset → Settings → Conversions API → *Generate access token*.)
4. Copy it **once** into the server's `.env` as `META_CAPI_ACCESS_TOKEN=…` (the VPS `.env` in production) and
   restart the API and workers. Never in the admin panel, chat, email or git (CLAUDE.md Rule 9).
5. Admin → Settings → Marketing and tracking: switch **Send events from the server** on.
   Admin → Marketing: paste the `TEST…` code, press **Send test event**, see it in Events Manager → Test events.

If the token leaks: delete it in Business Settings (System users → Revoke tokens), make a new one, replace it in
`.env`. A 190 error in the log means the same thing — make a new one.

## 3. Domain verification — step 39a

Business Settings → Brand safety → Domains → Add → "Meta-tag verification" shows
`<meta name="facebook-domain-verification" content="<code>" />`. Rafi pastes **only the code** into
Admin → Settings → Marketing and tracking; the shop adds the tag to every page's `<head>`. (DNS TXT record and
file upload are the other methods — DNS works too and needs no admin field.)

## 4. Catalog feed — step 39c

CSV/TSV or RSS/Atom XML at a fixed URL that Meta fetches on a schedule. Required for clothing:
`id` (SKU), `title`, `description`, `availability` (`in stock` / `out of stock`), `condition` (`new`),
`price` (`1490.00 BDT`), `link`, `image_link`, `brand`, `size`. Optional: `sale_price`, `item_group_id`
(product id — groups the sizes/colours), `color` (in words), `gender`, `additional_image_link`, `product_type`.

## 5. Bangladesh notes

- Many orders are Cash on Delivery and some are refused at the door. `Purchase` is sent when the order is
  **placed** (that's what Meta optimises for); step 39b adds an `OrderDelivered` custom event so ads can be
  optimised for delivered orders too.
- PDPO 2025 forbids profiling and targeted ads aimed at minors, and asks for equivalent protection when data
  leaves the country (Meta is outside Bangladesh) — the Privacy page must say data goes to Meta and Google.
