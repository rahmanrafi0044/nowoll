# Background workers (CLAUDE.md §10)

Slow work never runs during a customer's request: the API adds a **job** to a queue
(BullMQ on Redis) and answers at once; a **worker** process does the work.

| Piece | Where |
|---|---|
| Job contract (queue names, job data, retry rules) | `packages/queues` |
| Adding jobs (API) | `apps/api/src/notifications` — `QueuedOrderNotifier`, `QueuedLowStockAlerter` |
| Order worker | `workers/order-worker` |

## Orders queue (step 27)

| Job | Added when | Worker does |
|---|---|---|
| `order-confirmation` | a **cash-on-delivery** order is placed | receipt email to the customer |
| `payment-confirmed` | SSLCommerz payment confirmed (`PaymentsService.settle`) | "Payment received ✓" receipt email (only if still PAID) |
| `low-stock-alert` | stock reaches a variant's threshold | email to `EMAIL_ADMIN` |

Online orders get **no** email when placed — they may never be paid (and expire) — only "Payment received".
Jobs carry ids, not copies: the worker reads the order **fresh from the database**.

## Never twice, never lost
- **Fixed job ids** (`order-confirmation_NW-10001`): BullMQ ignores a job whose id it still has
  (finished jobs are kept 7 days). The job id is also Resend's `Idempotency-Key`.
- **Retries:** 5 tries, waiting 30 s, 1, 2, 4, 8 min. A hopeless email (Resend says the email itself
  is wrong) is not retried (`UnrecoverableError`).
- **Redis down while an order is placed:** the order still succeeds; adding the job is tried 3 times,
  then an `ALERT could not queue …` line is logged and that email is not sent.
  *Before launch, consider an "outbox" table (jobs saved in the same database transaction as the order,
  swept into Redis by the worker) if no email may ever be lost.*
- Old jobs are removed automatically (completed after 7 days, failed after 30) so Redis doesn't grow.

## Running
- `pnpm dev` starts the worker with the apps. Development emails go to **Mailpit** → http://localhost:8025.
- Needs `REDIS_URL` (Redis: `docker compose up -d redis`), `DATABASE_URL`, `EMAIL_ADMIN`, the email settings
  (docs/integrations/resend.md), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ADMIN_URL`.
- Stops gracefully on Ctrl+C / SIGTERM (finishes the job in hand).
- Production: its own Docker container (step 44).

## Tests
`workers/order-worker` uses its own database (`nowoll_worker_test`) and a unique Redis prefix per run, with a
real BullMQ worker. The API's tests replace the queued adapters with recording fakes (no Redis needed),
except `src/notifications/queued-notifiers.spec.ts`, which checks the jobs in a real Redis.

## Next (step 28 — notification worker)
shipped / delivered, return approved / rejected, refund processed, welcome, newsletter confirmation.
