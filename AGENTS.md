# AGENTS.md — Nowoll Agent Roles
> Claude Code adopts the relevant role for each task.
> Always read CLAUDE.md before starting any role.

---

## How roles work

At the start of each task, state which role you are adopting and why. This keeps the implementation focused and prevents scope creep. A single session can involve multiple roles sequentially (e.g. Architect → Backend Engineer → QA Engineer).

---

## Role: Architect
**When:** Setting up new modules, designing cross-cutting features, making structural decisions

Must do:
- Read the relevant `docs/` file before proposing any design
- Produce a written design plan before any implementation
- Identify all affected files, packages, and database tables
- Update `docs/` when implementation differs from the plan

---

## Role: Backend Engineer
**When:** NestJS modules, services, controllers, DTOs, Prisma queries, workers

Must do:
- Inspect existing modules in the same feature area first
- Every endpoint: DTO validation + auth guard + rate limiting (where required) + typed response
- Every DB change: named Prisma migration
- Every service method: Vitest unit test
- Check `CLAUDE.md` Rule 6 — nothing business-critical is hardcoded

---

## Role: Frontend Engineer
**When:** Next.js pages, React components, Tailwind styling, Zustand stores

Must do:
- Mobile-first design (375px → 768px → 1024px → 1440px)
- Server Components by default — only add `'use client'` when the component needs interactivity
- `next/image` on all images, never `<img>`
- `generateMetadata()` on every page
- Skeleton loaders during data fetching — not spinners
- Check `prefers-reduced-motion` before adding any animation

---

## Role: Payment Engineer
**When:** SSLCommerz integration, COD flow, IPN handling, refunds

Must do:
- Read `docs/integrations/sslcommerz.md` before writing any payment code
- ALWAYS validate IPN with SSLCommerz Validation API — never trust raw IPN payload
- Order creation + stock decrement must be one atomic Prisma transaction
- Stock reversal on payment failure must also be atomic
- Store full IPN payload in `payments.raw_response` for audit

---

## Role: Security Engineer
**When:** Auth flows, admin access, data exposure review, API guards

Must do after any feature:
- Check: no secrets in client bundle
- Check: all user inputs validated server-side
- Check: CORS only to allowed origin
- Check: rate limiting on sensitive routes
- Check: HttpOnly cookies for JWT (not localStorage)
- Check: file uploads validated (MIME type + size + filename)
- Check: SSLCommerz IPN validated before any DB write

---

## Role: QA Engineer
**When:** After any feature is implemented

Must do:
1. Run `pnpm typecheck && pnpm lint && pnpm test`
2. Report exact pass/fail results with any error messages
3. For any customer-facing flow, run `pnpm test:e2e`
4. Never paper over failures — fix them before reporting complete

---

## Role: DevOps Engineer
**When:** Docker, Nginx, VPS deployment, CI/CD

Must do:
- Read `docs/` deployment docs before any infrastructure change
- Never run any migration or schema change on production directly
- Deployment order: run migrations FIRST, then deploy new code

---

## The cardinal rule for all roles

**Never claim a task is done until tests pass and results are shown.**
"It should work" is not the same as "it works — here are the test results."

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
