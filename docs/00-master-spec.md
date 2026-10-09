# Nowoll — Master Product Specification
**Brand:** Nowoll — "always new" | **Market:** Bangladesh | **Currency:** BDT (৳)
**Monorepo orchestrator:** Turborepo | **Package manager:** pnpm

> This is the complete product specification for Nowoll.
> Claude Code must read this file at the start of every session alongside CLAUDE.md.
> CLAUDE.md = HOW to build. This file = WHAT to build.

---

## Build Order (follow this sequence strictly — do not jump ahead)

### Phase 1 — Foundation
```
1.  Monorepo scaffold: pnpm workspaces + Turborepo + shared tsconfig + shared eslint + prettier
2.  packages/database: Prisma schema (full, all tables) + initial migration + Supabase connection
3.  apps/api: NestJS scaffold — PrismaService, global exception filter, Helmet, CORS, rate limiting, ValidationPipe
4.  apps/storefront: Next.js scaffold — App Router, Tailwind, Supabase browser client, Zustand
5.  apps/admin: Next.js scaffold — App Router, Tailwind, admin auth middleware
6.  packages/types: Shared TypeScript interfaces
7.  packages/validation: Shared Zod schemas
8.  packages/ui: Design tokens only (Tailwind config, CSS variables, base Button/Input/Badge components)
```

### Phase 2 — Product Catalog
```
9.  apps/api: Categories module (CRUD, nested tree, slug auto-generation)
10. apps/api: Products module (CRUD, variants, image upload to Supabase Storage, full-text search, CSV import/export)
11. apps/api: Inventory module (stock adjustment, inventory log, low-stock email trigger)
12. apps/storefront: Homepage (hero, category grid, featured products, new arrivals, newsletter sign-up)
13. apps/storefront: Product Listing Page (filter sidebar, sort, pagination, quick-view modal)
14. apps/storefront: Product Detail Page (image gallery + zoom, variant selector, size guide, sticky add-to-cart)
```

### Phase 3 — Commerce Core
```
15. apps/api: Discount codes module (create, validate, usage tracking)
16. apps/storefront: Cart (Zustand store, slide-over drawer, cart page, discount code input)
17. apps/storefront: Checkout (multi-step: contact → address → shipping → payment → review)
18. apps/api: Orders module (ACID transaction: stock check → create order → decrement stock)
19. packages/payments: SSLCommerz adapter + COD adapter
20. apps/api: Payment module (SSLCommerz init, IPN handler, IPN validation, success/fail/cancel redirects)
21. apps/storefront: Checkout success page + public order tracking page (/orders/track)
```

### Phase 4 — Customer Features
```
22. apps/api + apps/storefront: Auth (register, login, forgot password, Google OAuth optional)
23. apps/storefront: Customer account pages (orders, wishlist, saved addresses, profile)
24. apps/api: Reviews module (submit after delivery, admin approve/reject)
25. apps/api: Returns module (customer request, admin approve/reject, refund trigger)
26. packages/email: Resend client + all email templates (see email triggers list below)
27. workers/order-worker: BullMQ worker for post-order jobs (email + low-stock check)
28. workers/notification-worker: BullMQ worker for alerts and status updates
```

### Phase 5 — Admin Panel
```
29. apps/admin: Dashboard (KPI cards, 7-day revenue chart, top products, low stock alerts)
30. apps/admin: Products CRUD (images, variants, bulk ops, CSV import/export)
31. apps/admin: Orders (list + filters, status update, tracking number entry, invoice PDF download)
32. apps/admin: Customers (list, detail, ban/unban)
33. apps/admin: Inventory (stock adjust modal, inventory log, low-stock filter)
34. apps/admin: Discounts (create/edit/delete codes, usage stats)
35. apps/admin: Returns (view requests, approve/reject)
36. apps/admin: Content (homepage sections, announcement bar, static pages, blog posts)
37. apps/admin: Shipping rates (zone-based: Dhaka / Outside Dhaka)
38. apps/admin: Settings (store info, admin email, VAT rate, low-stock threshold)
```

### Phase 6 — Analytics & Marketing
```
39. GA4 + GTM + Meta Pixel (via next/script in storefront layout)
40. apps/api: Analytics endpoints (revenue summary, revenue chart, top products, top categories)
41. apps/admin: Analytics dashboard (Recharts line chart, tables)
42. Newsletter sign-up form → Resend subscriber list or Mailchimp API
43. Blog section (storefront + admin CRUD)
```

### Phase 7 — Infrastructure & Polish
```
44. Docker: Dockerfiles for apps/api and workers
45. Docker: docker-compose.prod.yml for VPS (api + workers + nginx)
46. infrastructure/nginx/nowoll.conf: reverse proxy config for api.nowoll.com
47. CI/CD: GitHub Actions workflow (lint → typecheck → test → build → deploy)
48. Vercel: Connect storefront and admin apps, set environment variables
49. VPS: Certbot SSL for api.nowoll.com
50. Playwright E2E test suite: all critical flows
51. Lighthouse audit: achieve ≥ 90 mobile on homepage, PLP, PDP
52. Accessibility audit: WCAG 2.1 AA
53. Security audit: OWASP Top 10 checklist
54. Launch checklist verification (see section below)
```

---

## Storefront Pages

| Page | URL Pattern | Rendering |
|---|---|---|
| Homepage | `/` | SSG + ISR (60s) |
| Product Listing | `/shop` | SSG + ISR (60s) |
| Category | `/shop/[categorySlug]` | SSG + ISR (60s) |
| Product Detail | `/products/[productSlug]` | SSG + ISR (60s) |
| Cart | `/cart` | Client-side |
| Checkout | `/checkout` | Server (auth optional) |
| Checkout Success | `/checkout/success` | Client-side |
| Order Tracking | `/orders/track` | Server (no auth required) |
| Login | `/login` | Client-side |
| Register | `/register` | Client-side |
| Account Dashboard | `/account` | Server + auth guard |
| My Orders | `/account/orders` | Server + auth guard |
| Order Detail | `/account/orders/[id]` | Server + auth guard |
| Wishlist | `/account/wishlist` | Server + auth guard |
| Addresses | `/account/addresses` | Server + auth guard |
| Profile | `/account/profile` | Server + auth guard |
| Blog | `/blog` | SSG + ISR |
| Blog Post | `/blog/[slug]` | SSG + ISR |
| Privacy Policy | `/privacy` | Static |
| Terms of Service | `/terms` | Static |
| Return Policy | `/returns` | Static |
| 404 | not-found.tsx | Static |
| 500 | error.tsx | Client-side error boundary |

---

## Admin Panel Pages

| Page | Purpose |
|---|---|
| `/admin/login` | Admin authentication (email + password + 2FA TOTP) |
| `/admin/dashboard` | KPIs + 7-day revenue chart + top products + low stock alerts |
| `/admin/products` | Product list (sortable, filterable) |
| `/admin/products/new` | Create product form (images, variants, SEO) |
| `/admin/products/[id]` | Edit product |
| `/admin/orders` | Order list + status filters |
| `/admin/orders/[id]` | Order detail + status update + tracking entry + invoice PDF |
| `/admin/customers` | Customer list + search |
| `/admin/customers/[id]` | Customer detail + order history + ban toggle |
| `/admin/inventory` | All variants with stock levels |
| `/admin/inventory/low-stock` | Variants below threshold |
| `/admin/discounts` | Discount codes CRUD + usage report |
| `/admin/returns` | Return requests — approve/reject/refund |
| `/admin/content` | Homepage, announcement bar, static pages |
| `/admin/content/blog` | Blog post list |
| `/admin/content/blog/new` | Create blog post |
| `/admin/content/blog/[id]` | Edit blog post |
| `/admin/shipping` | Shipping zone rates |
| `/admin/analytics` | Revenue chart + product/category stats |
| `/admin/settings` | Store settings (contact info, VAT, thresholds) |

---

## Email Triggers

| Event | To | Template |
|---|---|---|
| Registration | Customer | Welcome email |
| Forgot password | Customer | Password reset link |
| Order placed (COD) | Customer | Order confirmation with receipt |
| SSLCommerz payment confirmed | Customer | Payment confirmed |
| Order shipped | Customer | Shipped + tracking link + courier name |
| Order delivered | Customer | Delivered |
| Return request approved | Customer | Return approved + next steps |
| Return request rejected | Customer | Return rejected + reason |
| Refund processed | Customer | Refund confirmation + amount |
| Newsletter sign-up | Subscriber | Confirmation + welcome |
| Variant stock ≤ threshold | Admin | Low stock alert (product + variant + current count) |

---

## Core Business Rules

- Guest checkout: no account required (email captured for order tracking)
- Stock decremented at order creation time, inside the Prisma transaction
- If SSLCommerz payment fails or is invalid → cancel order + restore stock (same transaction)
- COD orders: `payment_status = PENDING`; admin marks paid after collecting payment
- Reviews: only verified buyers (order status = DELIVERED, containing the product) can submit
- Reviews require admin approval before appearing on storefront
- Discount codes: validate expiry + usage limit + minimum order amount + active status
- Shipping rate: determined by customer's district (Dhaka vs outside Dhaka zone)
- Free shipping threshold: configurable per zone from admin settings
- Low-stock alert: sent when variant stock drops to or below the configured threshold
- All prices displayed and processed in BDT (৳)
- VAT: configurable rate from admin settings; displayed on checkout summary
- Business rules (fees, thresholds, policies) must ALWAYS be in the database, never hardcoded

---

## API Route Map

```
/api/v1/
├── auth/
│   ├── POST   /register
│   ├── POST   /login
│   ├── POST   /logout
│   ├── GET    /me
│   ├── PATCH  /me             (authenticated — name, mobile)
│   ├── POST   /change-password (authenticated — needs the current password; 5/min)
│   ├── POST   /forgot-password
│   └── POST   /reset-password
├── admin/                  (admin panel — every route: staff role + 2FA, except sign-in itself)
│   ├── auth/
│   │   ├── POST   /login        (email + password → { next: 'enroll' | 'verify' }; 5/min)
│   │   ├── POST   /2fa/enroll   (password-only session — first time: QR code; 5/min)
│   │   ├── POST   /2fa/verify   (password-only session — 6-digit code → full session; 5/min)
│   │   ├── GET    /me
│   │   └── POST   /logout
│   ├── customers/            (shop ACCOUNTS only — never staff)
│   │   ├── GET    /             (?q=name/email/phone, status=ACTIVE|BANNED, sort=newest|spent|orders|name, page)
│   │   ├── GET    /:id          (contact, stats, addresses, account orders + staff-only guest orders with the same email/phone)
│   │   ├── PATCH  /:id/ban      (reason required, staff-only; refused on next request + checkout by email/phone refused)
│   │   └── PATCH  /:id/unban
│   └── products/
│       ├── GET    /             (drafts + live; ?status=ARCHIVED|all, q, categoryId, lowStock, sort, page)
│       ├── GET    /:id          (the edit page: all non-deleted variants with exact stock, photos in order, what's missing to publish)
│       └── POST   /bulk         (publish | unpublish | feature | unfeature | archive — up to 100, each on its own)
├── categories/
│   ├── GET    /           (public, nested tree)
│   ├── GET    /:slug       (public)
│   ├── POST   /           (admin)
│   ├── PATCH  /:id         (admin)
│   └── DELETE /:id         (admin, soft delete)
├── products/
│   ├── GET    /           (public, paginated + filterable)
│   ├── GET    /:slug       (public)
│   ├── POST   /           (admin)
│   ├── PATCH  /:id         (admin)
│   ├── DELETE /:id         (admin, soft delete)
│   ├── POST   /:id/images  (admin)
│   ├── PATCH  /:id/images/:imageId (admin — alt text, order, variant)
│   ├── DELETE /:id/images/:imageId (admin)
│   ├── POST   /import      (admin, CSV; ?dryRun=true checks without saving)
│   └── GET    /export      (admin, CSV)
├── variants/
│   ├── GET    /product/:productId
│   ├── POST   /product/:productId  (admin)
│   ├── PATCH  /:id                 (admin)
│   └── DELETE /:id                 (admin)
├── inventory/
│   ├── GET    /            (admin)
│   ├── GET    /low-stock   (admin)
│   ├── PATCH  /:variantId/adjust  (admin — {change} or {setTo}, note required; records the staff member)
│   └── GET    /:variantId/log     (admin — reason, note, who, order number)
├── discounts/
│   ├── GET    /            (admin — with status ACTIVE|SCHEDULED|EXPIRED|USED_UP|OFF, discount given, sales; ?status= filter)
│   ├── GET    /:id         (admin — the code + the orders that used it)
│   ├── POST   /            (admin)
│   ├── PATCH  /:id         (admin)
│   ├── DELETE /:id         (admin)
│   └── POST   /validate    (public, rate-limited to 5/min)
├── orders/
│   ├── POST   /            (public — guest or authenticated)
│   ├── GET    /            (admin, paginated + filterable; ?status=CONFIRMED,PROCESSING takes several)
│   ├── GET    /my          (authenticated customer — orders placed while signed in)
│   ├── GET    /my/:number  (authenticated — own order by number, e.g. NW-10001; others → 404)
│   ├── POST   /track       (public, body {orderNumber, contact: email or phone}; 5/min — POST keeps the email out of URLs/logs)
│   ├── GET    /:id/receipt (public by order UUID — the confirmation page)
│   ├── GET    /:id         (admin — customers use /my/:number)
│   ├── PATCH  /:id/status  (admin — body {from, to, note?, courierName?, trackingNumber?, cashCollected?}; refused if `from` is outdated)
│   ├── PATCH  /:id/tracking (admin — correct courier/tracking after shipping; no new email)
│   ├── PATCH  /:id/notes   (admin — staff-only notes)
│   ├── PATCH  /:id/cash-collected (admin — COD cash handed over → paid)
│   └── GET    /:id/invoice (admin — data for the printable invoice page; the browser's "Save as PDF" makes the PDF, so Bangla prints correctly)
├── payment/
│   ├── POST   /sslcommerz/init     (authenticated or guest, after order)
│   ├── POST   /sslcommerz/ipn      (PUBLIC — called by SSLCommerz server)
│   ├── POST   /sslcommerz/success  (PUBLIC — browser redirect)
│   ├── POST   /sslcommerz/fail     (PUBLIC — browser redirect)
│   ├── POST   /sslcommerz/cancel   (PUBLIC — browser redirect)
│   (refunds: through returns — PATCH /returns/:id/refund)
├── addresses/
│   ├── GET    /            (authenticated)
│   ├── POST   /            (authenticated)
│   ├── PATCH  /:id         (authenticated, own address only)
│   └── DELETE /:id         (authenticated, own address only)
├── wishlist/
│   ├── GET    /            (authenticated)
│   ├── POST   /            (authenticated)
│   └── DELETE /:variantId  (authenticated)
├── reviews/
│   ├── GET    /product/:productId  (public, approved only)
│   ├── GET    /my          (authenticated — own reviews with status / rejection reason)
│   ├── POST   /            (authenticated, must have delivered order with product; again = edit → back to PENDING)
│   ├── GET    /            (admin, all statuses)
│   ├── PATCH  /:id/approve (admin)
│   └── PATCH  /:id/reject  (admin)
├── returns/
│   ├── POST   /            (authenticated)
│   ├── GET    /eligibility/:orderNumber (authenticated — what can still be returned, until when)
│   ├── GET    /my          (authenticated)
│   ├── GET    /            (admin)
│   ├── GET    /:id         (admin — incl. suggested refund and what's left to refund)
│   ├── PATCH  /:id/approve (admin — with instructions for the customer)
│   ├── PATCH  /:id/reject  (admin — with a reason)
│   ├── PATCH  /:id/receive (admin — restock per item)
│   ├── PATCH  /:id/refund  (admin — GATEWAY via SSLCommerz or MANUAL for cash orders)
│   └── PATCH  /:id/refunds/:refundId/resolve (admin — a refund SSLCommerz never answered about)
├── shipping/
│   ├── GET    /rates       (public — returns available rates by zone)
│   ├── GET    /            (admin)
│   ├── POST   /            (admin)
│   └── PATCH  /:id        (admin)
├── analytics/
│   ├── GET    /summary     (admin)
│   ├── GET    /revenue     (admin)
│   ├── GET    /top-products (admin)
│   ├── GET    /top-categories (admin)
│   └── GET    /customers   (admin)
├── blog/
│   ├── GET    /            (public, published only)
│   ├── GET    /:slug       (public)
│   ├── POST   /            (admin)
│   ├── PATCH  /:id        (admin)
│   └── DELETE /:id        (admin)
├── subscribers/
│   └── POST   /           (public — newsletter sign-up)
└── settings/
    ├── GET    /            (admin)
    └── PATCH  /            (admin, bulk key-value update)
```

---

## Launch Checklist

Run through every item before going live:

**DNS & SSL**
- [ ] `nowoll.com` pointing to Vercel
- [ ] `api.nowoll.com` pointing to Hostinger VPS
- [ ] SSL certificate active on `api.nowoll.com` (Certbot)
- [ ] HTTPS enforced on both domains (no HTTP access)

**Environment Variables**
- [ ] All production env vars set in Vercel (storefront + admin)
- [ ] All production env vars set in `.env` on VPS
- [ ] No dev/sandbox keys in production config

**Payments**
- [ ] SSLCommerz live credentials active (not sandbox)
- [ ] IPN URL registered in SSLCommerz merchant panel: `https://api.nowoll.com/api/v1/payment/sslcommerz/ipn`
- [ ] Full SSLCommerz payment flow tested with real BDT amount
- [ ] COD flow tested end-to-end

**Database**
- [ ] Prisma migrations applied on production Supabase
- [ ] RLS policies enabled on all tables
- [ ] Supabase Storage bucket `product-images` created with public read policy
- [ ] Daily automated backups confirmed (Supabase Pro)

**Content**
- [ ] All product images uploaded with alt text
- [ ] Privacy Policy, Terms, Return Policy text finalized
- [ ] Business contact details visible on site (address, email, phone)
- [ ] All placeholder/dummy content removed
- [ ] Announcement bar content set

**Functionality**
- [ ] Guest purchase (SSLCommerz): browse → cart → checkout → payment → email received ✓
- [ ] Guest purchase (COD): browse → cart → checkout → order placed → email received ✓
- [ ] Registered user: login → wishlist → checkout with saved address ✓
- [ ] Discount code: apply, validate, remove ✓
- [ ] Order tracking without login ✓
- [ ] Admin: add product → appears on storefront within 60s ✓
- [ ] Admin: mark shipped → customer receives email with tracking link ✓
- [ ] Low stock email fires at threshold ✓

**SEO & Performance**
- [ ] `/sitemap.xml` accessible and valid
- [ ] Structured data passes Google Rich Results Test
- [ ] Lighthouse mobile score ≥ 90 on homepage, PLP, PDP
- [ ] No horizontal scroll on mobile

**Monitoring**
- [ ] Sentry receiving events (test error triggered)
- [ ] UptimeRobot monitoring `nowoll.com` and `api.nowoll.com`
- [ ] GitHub Actions CI passing on main branch

---

*Nowoll — always new | Spec version: October 2026*
