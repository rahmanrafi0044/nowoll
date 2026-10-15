# What Rafi can change from the admin panel

> **Goal (CLAUDE.md §1):** run the store without a developer — like a WooCommerce
> store with its Customizer. Everything a shop owner normally changes is editable
> in the admin panel. A small, fixed list is deliberately **not** (see the end).
>
> Agreed with Rafi on 9 Oct 2026. Status is kept up to date as steps are built.

**Status:** ✅ editable in the admin panel · 🛠 being built / planned (step number) · ⛔ never admin-editable

---

## How editable content stays safe (rules for every item below)

1. **Validated shapes, never free-form code.** Each editable block has a schema
   (`packages/validation/src/content.ts`); the API refuses anything that doesn't fit,
   and the storefront hides a block whose saved data is invalid instead of breaking.
2. **Safe links only.** Links are an internal path (`/shop/men`) or a full `https://` URL —
   never `javascript:` or other schemes.
3. **Text, not HTML.** Long text (pages, blog) is **Markdown**, rendered without raw HTML
   or scripts. No field anywhere accepts pasted HTML or JavaScript.
4. **Images are uploaded, not linked.** JPEG / PNG / WebP up to 5 MB, checked by type and
   size, stored in Supabase Storage (CLAUDE.md §11.7).
5. **A missing setting never breaks the shop.** Every block has a sensible default — a
   new store looks complete before anything is edited.
6. **Changes appear within a minute** (the storefront rebuilds pages at most every 60 s).

---

## The list

### A. Store identity and branding
| # | What | Status |
|---|---|---|
| 1 | Store name and tagline — used by the header, footer, page titles, invoices and emails | ✅ (step 38) |
| 2 | Logo (header), favicon, social-share image (Facebook / WhatsApp preview) | ✅ (step 38) |
| 3 | Brand colours (buttons, links, accents) and the font — from a safe, readable list (contrast checked) | ✅ (step 38) |
| 4 | Contact details: email, phone, address, WhatsApp number, opening hours — shown in the footer and on invoices (the Contact page is your own text) | ✅ (step 38) |
| 5 | Social media links: Facebook, Instagram, TikTok, YouTube | ✅ (step 38) |

### B. Header and navigation
| # | What | Status |
|---|---|---|
| 6 | Main menu: which categories, in what order, plus custom links ("Sale", "Eid collection") | ✅ (step 38b) |
| 7 | Announcement bar (text, link, on/off) | ✅ (step 36) |

### C. Homepage
| # | What | Status |
|---|---|---|
| 8 | Hero: heading, text, button, photo | ✅ (step 36) |
| 9 | Show / hide and rename sections (categories, featured, new arrivals, newsletter) | ✅ (step 36) |
| 10 | Section order | ✅ (step 36) |
| 11 | Promo banners: 1–3 picture banners, each with a link | ✅ (step 36) |
| 12 | Extra product rows from a category or tag (e.g. "Eid collection") | ✅ (step 36) |
| 13 | Trust badges ("Cash on delivery · 7-day returns · Nationwide delivery") | ✅ (step 36) |

### D. Catalogue
| # | What | Status |
|---|---|---|
| 14 | Products, variants, photos, bulk actions, CSV | ✅ (step 30) |
| 15 | Categories: create, edit, archive, photo, order, on/off | ✅ (step 36b) |
| 16 | Shop page defaults: products per page, default sort | ✅ (step 38) |

### E. Product page
| # | What | Status |
|---|---|---|
| 17 | "Delivery and returns" info box | ✅ (step 38d) |
| 18 | Size guide per category | ✅ (step 36b) |

### F. Footer
| # | What | Status |
|---|---|---|
| 19 | Footer link columns, short "about" text, copyright line | ✅ (step 38b) |
| 20 | Payment-method logos (bKash, Nagad, cards, cash on delivery) — chosen from a fixed set | ✅ (step 38b) |

### G. Pages and blog
| # | What | Status |
|---|---|---|
| 21 | Static pages (privacy, terms, returns, about, contact) — Markdown, draft / published, SEO | ✅ (step 36) |
| 22 | FAQ page (a static page) | ✅ (step 36) |
| 23 | Blog | ✅ (step 43) |

### H. Checkout and payments
| # | What | Status |
|---|---|---|
| 24 | Delivery zones, rates, free-delivery minimum | ✅ (step 37) |
| 25 | Payment methods on / off (cash on delivery, online) and their descriptions | ✅ (step 38c) |
| 26 | Cash-on-delivery limit (e.g. none above ৳10,000) and a minimum order amount | ✅ (step 38c) |
| 27 | The "thank you" message after ordering | ✅ (step 38) |
| 28 | VAT rate, return window, low-stock limit, unpaid-order timeout, admin email | ✅ (step 38) |

### I. Emails
| # | What | Status |
|---|---|---|
| 29 | Subject lines, headings and opening paragraphs of each customer email ({placeholders}); email footer and logo (PNG/JPEG). The facts and layout stay fixed so emails are always complete and render well. Admins only; "Send me a test" | ✅ (step 43b) |

### J. SEO and marketing
| # | What | Status |
|---|---|---|
| 30 | Google title / description per product, category, page | ✅ (steps 30, 36, 36b) |
| 31 | Site-wide Google title / description and share image | ✅ (step 38) |
| 32 | Google Analytics, Google Tag Manager and Meta Pixel **IDs**, Meta domain-verification code (validated ID fields; the scripts themselves are added by code, and load only after the customer agrees) | 🛠 39a |
| Meta server events on/off (Conversions API); Admin → Marketing: setup checklist, "send test event" (Meta's test code), delivery log | 🛠 39b |
| Meta catalogue feed on/off (Admin → Marketing → Catalog feed: address to copy, item count, products left out and why) | 🛠 39c |
| Newsletter: footer form on/off, checkout "email me" box on/off, copy to Resend on/off + segment id; Admin → Newsletter (list, unsubscribe, erase, CSV, sync). Newsletters themselves are written in Resend | 🛠 42 |
| Blog posts: write, photos (uploaded here only), tags, "Shop the look", publish now or on a date, archive (Content → Blog) | 🛠 43 |
| 33 | Redirects: an old web address sends visitors to the new one (Content → Redirects; added by itself when a product / category / page / blog post address changes; this shop's addresses only) | ✅ (step 43c) |

### K. Staff
| # | What | Status |
|---|---|---|
| 34 | Add / remove staff and set their role (ADMIN only; always with 2FA) | ✅ (step 38e) |

---

## ⛔ Never editable from the admin panel — developer-side, for safety

These are deliberately kept out of the admin panel. **Do not add admin editors for them,
even if asked later** — explain why and offer the safe alternative instead.

| What | Why | Safe alternative |
|---|---|---|
| **Payment and API secret keys** (SSLCommerz, Supabase service role, Resend, Resend webhook secret, Meta Conversions API access token, …) | A stolen admin session must never reveal or change secrets (CLAUDE.md Rule 3) | Server environment variables, changed by a developer |
| **Pasting raw HTML or JavaScript** anywhere (pages, banners, "custom code" boxes) | The most common way online shops get hacked (XSS, card skimming) | Markdown text; validated ID fields for analytics / Pixel |
| **Turning off admin 2FA** | Admin accounts control money and customer data (CLAUDE.md §11.8) | Always on; lost phone → `pnpm admin:reset-2fa` |
| **New page layouts or new features** | Real development work that needs tests | A developer step in this spec |

---

## Later: storefront design refresh (Rafi, 9 Oct 2026)

Rafi wants to improve the storefront's look and feel to impress customers, after
exploring the live site together. Planned as **step 38f** (after the admin-editable
steps, before Phase 6). Every admin-editable item above must keep working through the
redesign — the design changes *how* things look, never *what* Rafi can edit.
