# Tracking Contract — consent, Google Analytics 4, Google Tag Manager

**Code:** `packages/analytics` (consent + event builders) · `apps/storefront/src/components/tracking/*`
**Checked against the official docs:** October 2026 (step 39a). Meta (Pixel, Conversions API, catalog) is in
[meta.md](./meta.md).

| Topic | Official source |
|---|---|
| GA4 tag (gtag.js) | https://developers.google.com/tag-platform/gtagjs/install |
| GA4 ecommerce events | https://developers.google.com/analytics/devguides/collection/ga4/ecommerce |
| GTM install | https://developers.google.com/tag-platform/tag-manager/web |
| GTM data layer | https://developers.google.com/tag-platform/tag-manager/datalayer |
| Bangladesh Personal Data Protection Ordinance 2025 | gazetted November 2025, 18-month compliance window |

## 1. Consent comes first

Nothing that tracks people loads until the customer chooses. The banner offers **Accept all**, **Only
necessary** and **Choose** (two switches: *Analytics* and *Marketing*). The choice is saved in the
browser (`localStorage` key `nowoll-consent`, with a version number and the date). "Cookie settings" in the
footer reopens it at any time.

| Tool | Needs |
|---|---|
| Google Analytics 4 | Analytics |
| Meta Pixel | Marketing |
| Google Tag Manager | Analytics **and** Marketing (GTM can load any tag, so we can't tell what it will do) |

Why so strict: the PDPO 2025 needs consent that is specific, freely given and can be withdrawn, and asks the
shop to say what is collected, why, who receives it and how long it is kept. Saying "No" must be as easy as
"Yes" (both buttons the same size). Withdrawing consent removes the tracking cookies on our domain
(`_ga*`, `_gid`, `_gcl_*`, `_fbp`, `_fbc`) and reloads the page so the scripts are gone.

We don't use Google "Consent Mode" (it loads Google's script before consent and sends cookieless pings);
not loading at all is simpler and clearly within the law.

The Privacy page (a starter page Rafi edits) must list the tools. The starter text has a paragraph for it.

## 2. Google Analytics 4 (gtag.js)

**ID:** Admin → Settings → Marketing and tracking → "Google Analytics 4 Measurement ID", format `G-` +
letters/digits (e.g. `G-AB12CD34EF`). Found in GA4 → Admin → Data streams → Web.

Snippet (official), loaded with `next/script` only after consent:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXX');
</script>
```

GA4 counts page views itself on route changes ("Enhanced measurement → page changes based on browser history
events", on by default), so we don't send `page_view` by hand.

### Ecommerce events we send

| When | GA4 event | Parameters |
|---|---|---|
| Product page opened | `view_item` | `currency`, `value`, `items` |
| "Add to bag" | `add_to_cart` | `currency`, `value`, `items` |
| Checkout opened | `begin_checkout` | `currency`, `value`, `coupon?`, `items` |
| Order placed (COD) / paid (online) | `purchase` | `transaction_id`, `value`, `tax`, `shipping`, `currency`, `coupon?`, `items` |

`items[]`: `item_id` (the **product** id, so GA4's product reports follow one product from "viewed" to
"bought"), `item_name`, `item_variant` (the size/colour, e.g. "M / Blue"), `price`, `quantity`. (Meta gets the
variant SKU instead — see meta.md.) Currency is always `BDT`. `value` for purchase = order total.

`purchase` is sent **once** per order: the confirmation page remembers sent orders in `localStorage`
(`nowoll-tracked-orders`), so a refresh doesn't count it twice. `transaction_id` = the order number
(`NW-10001`); GA4 also removes duplicates with the same `transaction_id`.

## 3. Google Tag Manager

**ID:** "Google Tag Manager container ID", format `GTM-` + letters/digits. Official snippet: the head script
pushes `{'gtm.start': time, event: 'gtm.js'}` to `dataLayer` and loads
`https://www.googletagmanager.com/gtm.js?id=GTM-XXXX`; the `<noscript>` iframe
(`https://www.googletagmanager.com/ns.html?id=GTM-XXXX`) is **not** used — without JavaScript the consent
banner can't be shown, so nothing may load.

Every shopping event is also pushed to `dataLayer` in GA4's format (`{ event: 'add_to_cart', ecommerce: {…} }`,
after `{ ecommerce: null }` to clear the previous one, as Google recommends). A marketer can build tags in GTM
on these without a developer.

⚠️ **Use GA4 directly or through GTM, not both.** If the GA4 ID is filled in *and* GTM has a GA4 tag,
every visit is counted twice. The admin page says this next to the fields.

## 4. What is never admin-editable

Only IDs are typed in, each checked against its format. No "paste your script" box exists (CLAUDE.md Rule 9:
pasted HTML/JavaScript is how shops get card-skimmed). A new tool = a developer adds its official snippet.
