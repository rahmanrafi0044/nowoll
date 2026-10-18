---
name: verify-step
description: Full verification of a Nowoll change before committing — format, types, lint, all unit tests, Playwright browser tests, migration review and mutation checks, run the way CI runs them. Use before every commit of app code (apps/, packages/, workers/) and whenever asked to "verify", "check", or confirm a step is done.
---

# Verify a step (before committing)

CLAUDE.md Rule 5: never claim success without verification. These are the checks CI runs, plus the ones CI
can't run. Report results as a short table with pass/fail and the numbers (e.g. "18/18 browser tests").

## 0. Prepare (this PC has ~5 GB for WSL)

- **Stop the dev servers first** (`pnpm dev`): the tests start their own apps, and both together run out of
  memory and restart WSL. Stop them by the PID you recorded, then free ports 3000/3001/3002 by PID — never
  `pkill` / `pgrep -f`.
- Also stop the $0 trial if it's running and memory is short: `infrastructure/preview/preview.sh down`.
- Dev containers must be up: `docker ps` shows `nowoll-postgres`, `nowoll-redis`, `nowoll-mailpit`. If not:
  `docker compose up -d` from the repo root. (An empty API result in a test usually means Docker is down,
  not a pass.)
- After switching branches: `pnpm install --frozen-lockfile && pnpm db:generate`, and delete stale Next.js
  types (they break typecheck with errors inside `.next/`):
  `rm -rf apps/{storefront,admin}/.next/dev/types apps/{storefront,admin}/.next/types`

## 1. The checks (run long ones in the background)

```bash
pnpm exec prettier --check . \
  && pnpm exec turbo run build --filter='./packages/*' --concurrency=1 \
  && pnpm exec turbo run typecheck lint --concurrency=2 \
  && pnpm exec turbo run test --concurrency=1
pnpm --filter @nowoll/api build && pnpm --filter @nowoll/e2e test:e2e      # browser tests
```

`--concurrency=1/2` keeps memory under control. A browser test that times out in `resetDatabase` under load
is a known flake — re-run once before investigating.

**Match CI, not this PC.** Files that exist only here (gitignored) make local runs greener than CI:
`apps/storefront/public/demo/` photos (move the folder aside while running e2e, then restore it), and
`packages/*/dist`. Tests may use only files in git or ones the app generates (`/robots.txt`, `/sitemap.xml`).

## 2. If `schema.prisma` changed

- Read the generated `packages/database/prisma/migrations/<name>/migration.sql` **before** applying it.
  The local database can hold tables from other open branches, so `prisma migrate dev` may add stray
  `DROP TABLE`s — remove them; the migration must contain only this step's change.
- Migrations must be **two-step safe** (docs/deployment.md): add, never remove or rename something the
  running version still uses.
- New table → RLS enabled (CLAUDE.md §7).

## 3. Mutation checks (do the tests really guard the new rules?)

For each new rule or branch of logic: break it on purpose in the source (one change at a time — e.g. invert
a condition, drop a check, return early), run only the related test file, and confirm a test **fails**.
Restore the file every time (`git diff` must show only your real changes afterwards). A mutation that
changes no behaviour (a redundant guard) is fine — say so. A surviving one = a missing test: add it.
If interrupted mid-check, inspect and restore the mutated file before anything else.

## 4. Report, then commit

- Results table + anything skipped and why (e.g. "no e2e: docs only").
- Commit with a conventional message (`feat(scope): …`, `fix(…)`, `docs: …`), ending with the attribution
  trailer from the session's system reminder.
- Customer-visible changes then need **Rafi's live check** before the PR (see the ship-pr skill).
