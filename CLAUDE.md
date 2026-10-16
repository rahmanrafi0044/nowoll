# CLAUDE.md — Nowoll E-Commerce Platform
> **Read this entire file before touching any code. This is your brain.**
> Brand: Nowoll | Caption: "always new" | Market: Bangladesh

---

## 1. WHO YOU ARE BUILDING FOR

**Owner:** Rafi — beginner web developer, non-technical operator after launch
**Goal:** A fully operational clothing store that Rafi can run without a developer
**Rule:** If Rafi can't do it from the admin panel, it shouldn't require a developer

---

## 2. TECH STACK — DO NOT DEVIATE

| Layer | Technology | Why |
|---|---|---|
| Monorepo orchestration | **Turborepo** | Parallel dev servers, build caching, task graph |
| Package manager | **pnpm workspaces** | Efficient, fast, monorepo-native |
| Frontend storefront | **Next.js (App Router)** + TypeScript + Tailwind CSS | SSG/ISR for SEO, server components |
| Frontend admin | **Next.js (App Router)** + TypeScript + Tailwind CSS | Separate app, same monorepo |
| Frontend state | **Zustand** | Cart, wishlist — lightweight and simple |
| Backend API | **NestJS** + TypeScript + REST | Modular, scalable, well-structured |
| ORM | **Prisma** (shared package) | Type-safe DB client, single schema source of truth |
| Database | **PostgreSQL via Supabase** | Managed, RLS, backups |
| File storage | **Supabase Storage** | Product images |
| Auth | **Supabase Auth** | JWT, session cookies |
| Payments | **SSLCommerz** (primary) + **Cash on Delivery** | Bangladesh market |
| Email | **Resend** | Transactional, branded HTML |
| Job queues | **BullMQ + Redis** | Background workers (orders, emails, notifications) |
| Backend hosting | **Hostinger VPS** — Docker Compose + Nginx + Certbot, behind **Cloudflare** (free) | Ubuntu, containerized; docs/deployment.md |
| Frontend hosting | **Hostinger VPS** (Docker, behind Nginx + Cloudflare free) | Owner's decision, Oct 2026: no extra cost (Vercel Pro would be $20/month — Hobby is non-commercial only); customers are all in Bangladesh and buying needs the VPS anyway. Vercel stays an easy option later (standard Next.js) |
| Error tracking | **Sentry** | Both frontend and backend |
| Testing | **Vitest** (unit) + **Playwright** (E2E) | All critical flows tested |
| Version control | **GitHub** + GitHub Actions (CI/CD) | Protected main branch |

---

## 3. MONOREPO STRUCTURE (Turborepo)

```
nowoll/
├── apps/
│   ├── storefront/          # Next.js — public customer-facing store
│   ├── admin/               # Next.js — internal admin panel
│   └── api/                 # NestJS — REST API server
│
├── packages/
│   ├── database/            # Prisma schema + migrations + generated client
│   │   ├── prisma/
│   │   │   └── schema.prisma   ← SINGLE SOURCE OF TRUTH for DB
│   │   └── src/
│   │       └── index.ts     # Re-exports PrismaClient
│   ├── types/               # Shared TypeScript interfaces (Order, Product, etc.)
│   ├── validation/          # Shared Zod schemas (used on both frontend and backend)
│   ├── ui/                  # Shared React components (design system)
│   ├── config/              # Shared tsconfig, eslint, tailwind configs
│   ├── auth/                # Auth utilities (token parsing, role checks)
│   ├── payments/            # Payment provider adapters (SSLCommerz, COD)
│   ├── shipping/            # Courier adapters (manual phase 1, Pathao phase 2)
│   ├── email/               # Resend client + all email templates
│   └── analytics/           # GA4, Meta Pixel event helpers
│
├── workers/
│   ├── order-worker/        # Handles order.confirmed → email + courier booking
│   ├── notification-worker/ # Low stock alerts, return status updates
│   └── payment-worker/      # SSLCommerz IPN processing, reconciliation
│
├── infrastructure/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── web.Dockerfile      # the shop and the admin (Next.js standalone)
│   ├── nginx/
│   │   └── nowoll.conf.template   # + tls.conf, proxy-next.conf, cloudflare-real-ip.conf
│   └── deployment/
│       ├── docker-compose.prod.yml   # shop, admin, API, workers, Redis (× staging, production)
│       ├── docker-compose.edge.yml   # Nginx + certbot, shared
│       └── deploy.sh                 # runs on the VPS: restart, health check, rollback
│
├── docs/                    # ALL architecture and integration documentation
│   ├── 00-master-spec.md
│   ├── learning/            # Personal learning track (parallel to building)
│   └── integrations/
│       ├── sslcommerz.md
│       ├── courier.md
│       ├── supabase.md
│       └── resend.md
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                 # Playwright — all critical customer flows
│
├── .claude/
│   └── commands/            # Reusable Claude Code slash commands
│
├── CLAUDE.md                ← you are here
├── AGENTS.md
├── README.md
├── turbo.json               ← Turborepo task configuration
├── docker-compose.yml       ← Local dev (postgres + redis + mailpit)
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. TURBOREPO TASK CONFIGURATION

The `turbo.json` in the root defines how tasks run across all apps and packages.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Key commands (run from repo root):**
```bash
pnpm dev          # Starts ALL apps concurrently (storefront + admin + api)
pnpm build        # Builds all apps in dependency order
pnpm typecheck    # Type-checks all packages
pnpm lint         # Lints all packages
pnpm test         # Runs all unit tests
pnpm db:generate  # Regenerates Prisma client after schema change
pnpm db:migrate   # Runs pending migrations
```

---

## 5. SHARED PRISMA PACKAGE

The Prisma schema lives in `packages/database/` and is shared across all apps. This means:
- NestJS API imports `PrismaClient` from `@nowoll/database`
- Next.js apps can import Prisma types (not the client itself — server only)
- One schema = one source of truth = no type drift between frontend and backend

```typescript
// packages/database/src/index.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query'] : [] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from '@prisma/client'  // Re-export all generated types
```

---

## 6. MANDATORY RULES — NEVER BREAK THESE

### Rule 1 — Never assume. Always inspect first.
Before implementing anything:
1. Read the relevant `docs/` file for that domain
2. Inspect existing code in the same feature area
3. Inspect `packages/database/prisma/schema.prisma` for related models
4. Inspect related services and their interfaces
5. Write an implementation plan
6. Get approval (or proceed if already approved in session)

### Rule 2 — Never invent an external API
SSLCommerz, Pathao, bKash, Steadfast — read the integration contract in `docs/integrations/` first. If the contract says "TODO: confirm with provider", write a stub with a clear TODO. Never guess field names.

### Rule 3 — Never commit secrets
`.env` files never go in git. Service role keys, payment secrets, API keys are server-side only. Client bundles only receive public env vars (`NEXT_PUBLIC_*`).

### Rule 4 — Never touch production database directly
Dev: Claude → local PostgreSQL (Docker). Production: `prisma migrate deploy` in CI only.

### Rule 5 — Never claim success without verification
After any implementation:
```bash
pnpm typecheck
pnpm lint
pnpm test
```
For checkout/payment/order features also:
```bash
pnpm test:e2e
```

### Rule 6 — Never hardcode business rules
Shipping fees, discount thresholds, low-stock limits, free shipping minimums, VAT — all admin-configurable in the database. Never in source code.

### Rule 7 — Never modify production schema manually
Schema change → `schema.prisma` edit → `prisma migrate dev --name <name>` → review → staging → production CI.

### Rule 8 — One feature branch per feature
Never commit directly to `main`. Every feature = `feature/<name>` branch → PR → merge.

### Rule 9 — Admin-editable, but never the dangerous things
Storefront content and store rules are editable from the admin panel (see
`docs/admin-editable.md`). Its **"never admin-editable"** list is binding: secret keys,
pasted HTML/JavaScript, turning off admin 2FA, and new layouts/features stay
developer-side — even if asked later. Explain why and offer the safe alternative.

---

## 7. DATABASE RULES

- Prisma schema: `packages/database/prisma/schema.prisma` — single file, all models
- Every schema change = a named migration (`prisma migrate dev --name descriptive-name`)
- Supabase RLS enabled on every table — no table is ever left without a policy
- Never store full card numbers, bank account numbers, or government IDs
- Soft delete preferred over hard delete (set `deleted_at` timestamp or `status = ARCHIVED`)

---

## 8. API RULES

- REST only — no GraphQL, no tRPC (external integrations and potential mobile app need REST)
- Base path: `/api/v1/`
- HTTP methods: GET (read), POST (create), PATCH (update), DELETE (soft delete)
- Authentication: JWT in HttpOnly cookie (`Secure`, `SameSite: Strict`)
- All responses: `{ success: boolean, data?: T, message?: string, error?: string }`
- Rate limiting: 100 req/min global; 5 req/min on `/auth/*` and `/payment/*`
- All inputs validated with class-validator DTOs in NestJS (`ValidationPipe` globally)
- CORS: only `ALLOWED_ORIGIN` env var — never wildcard

---

## 9. PAYMENT RULES

Use the adapter pattern — NestJS business logic never knows which provider is active:

```typescript
// packages/payments/src/types.ts
export interface PaymentProvider {
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>
  verifyPayment(params: VerifyParams): Promise<VerifyResult>
  refundPayment(params: RefundParams): Promise<RefundResult>
  getStatus(transactionId: string): Promise<PaymentStatus>
}
```

**SSLCommerz critical rule:** ALWAYS validate IPN with SSLCommerz Validation API using `val_id`. Never trust `status=VALID` in the raw IPN payload. A malicious actor can POST a fake IPN.

**Order transaction rule:** Stock decrement + order creation + payment record creation must be a single Prisma transaction. If any step fails, everything rolls back.

---

## 10. BACKGROUND WORKERS (BullMQ + Redis)

Do NOT block HTTP responses with slow operations. After order creation, queue jobs:

```
POST /orders → HTTP 200 returned immediately
     ↓
BullMQ order queue
     ↓
order-worker picks up job:
  ├── Send order confirmation email (Resend)
  ├── Book courier (Phase 1: skip / Phase 2: Pathao API)
  ├── Check low stock → if below threshold → alert email to admin
  └── Record analytics event
```

Workers live in `workers/` directory as separate Node.js processes managed by Docker Compose.

---

## 11. SECURITY RULES

1. Helmet middleware on NestJS (all security headers)
2. CORS restricted to `ALLOWED_ORIGIN` only
3. Rate limiting: `@nestjs/throttler`
4. JWT in HttpOnly cookie — never localStorage
5. Supabase service role key: server only, never in any bundle
6. All inputs validated server-side (DTOs + ValidationPipe)
7. File uploads: validate MIME type (jpeg/png/webp only), max 5MB, sanitize filename
8. Admin routes: JWT + role check (ADMIN or STAFF) + 2FA (TOTP) enforced
9. SSLCommerz IPN: validate with SSLCommerz API — never trust raw payload
10. Content-Security-Policy header configured

---

## 12. TESTING RULES

- Every NestJS service method → Vitest unit test
- Every API endpoint → integration test
- Every customer-facing flow → Playwright E2E test:
  - Homepage → category → PDP → add to cart → checkout → confirmation ✓
  - Admin: login → create product → visible on storefront ✓
  - Admin: receive order → update to shipped → customer email sent ✓
- Claude must run relevant tests and report results before calling any feature complete

---

## 13. SEO RULES

- `generateMetadata()` on every Next.js page
- `generateStaticParams()` + ISR (`revalidate: 60`) on product and category pages
- `next/image` everywhere — never `<img>`
- Slug URLs for all public pages — never numeric IDs
- `/sitemap.xml` auto-generated
- JSON-LD: Product, BreadcrumbList, Organization, BlogPosting
- Canonical tags on filtered PLP pages

---

## 14. WHAT CLAUDE CODE MUST DO AT THE START OF EVERY SESSION

```
1. Read CLAUDE.md (this file)
2. Read docs/00-master-spec.md
3. Run: git status
4. Report: what was completed last session, what is next, any blockers
5. Propose a plan for this session
6. Wait for approval
7. Build
8. Verify (typecheck + lint + test)
9. Commit with conventional commit message
```

---

## 15. WHAT RAFI WANTS TO UNDERSTAND (not just build)

Rafi learns best by doing AND understanding why. For any non-trivial implementation:
- Add a short comment block explaining WHY the code is structured this way
- When a pattern is used (e.g. adapter pattern, factory, repository), name it and explain it in one line
- When a database decision is made (index, relation type, constraint), explain the reasoning

---

*Nowoll — always new | CLAUDE.md version: October 2026*
*Read by Claude Code at the start of every session.*
