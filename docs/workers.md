# Background workers (CLAUDE.md §10)

Slow work never runs during a customer's request: the API adds a **job** to a queue
(BullMQ on Redis) and answers at once; a **worker** process does the work.

| Piece | Where |
|---|---|
| Job contract (queue names, job data, retry rules) | `packages/queues` |
| Adding jobs (API) | `apps/api/src/notifications` — `QueuedOrderNotifier`, `QueuedLowStockAlerter`, `QueuedCustomerNotifier` |
| Order worker | `workers/order-worker` |
| Notification worker | `workers/notification-worker` |

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
`workers/order-worker` and `workers/notification-worker` use their own databases (`nowoll_worker_test`, `nowoll_notify_test`) and a unique Redis prefix per run, with a
real BullMQ worker. The API's tests replace the queued adapters with recording fakes (no Redis needed),
except `src/notifications/queued-notifiers.spec.ts`, which checks the jobs in a real Redis.

## Notifications queue (step 28)

| Job | Added when | Email (only if still true when the job runs) |
|---|---|---|
| `welcome` | sign-up succeeded (`AuthService.register`) | welcome — skipped for banned accounts |
| `newsletter-confirm` | newsletter sign-up (new, or again after unsubscribing) | confirm + unsubscribe links — only while PENDING |
| `return-approved` / `return-rejected` | admin approves / rejects a return | instructions / reason — only while that is the status |
| `refund-processed` | a refund is really done (manual, SSLCommerz success, reconcile, admin resolve) | amount; wording by how the money went back |
| `order-shipped` / `order-delivered` | **the admin order screen (step 31)** — nothing calls these yet | courier + tracking / the return window |

Every job is added only **after** the change is saved; the same event twice is one job (fixed ids).

**Newsletter links** open `/newsletter/confirm` and `/newsletter/unsubscribe`, pages with a **button** — the
action never happens on just opening the link (email scanners open links). One secret token per
subscriber serves both links and stays valid, so future newsletters can carry the unsubscribe link.
Signing up again while PENDING sends nothing new (no inbox flooding through the form).

## Marketing queue (step 39b)

Meta Conversions API events — docs/integrations/meta.md. Run by the **notification worker process**, but by
its own BullMQ worker (concurrency 2), so a slow or broken Meta never delays an email.

| Job | Added when | Worker does |
|---|---|---|
| `meta-event` `{kind: 'purchase'}` | COD order placed / online payment confirmed — **only if the customer allowed Marketing** (the order has an `order_tracking` row) | `Purchase` to Meta |
| `meta-event` `{kind: 'delivered'}` | admin marks the order Delivered (same consent rule) | `OrderDelivered` to Meta |
| `tracking-cleanup` | every 24 h (a BullMQ job scheduler, set up when the worker starts) | deletes `order_tracking` rows older than 60 days, `meta_events` log lines older than a year |

- Job ids `meta-purchase_NW-10001` / `meta-delivered_NW-10001`: each event at most once.
- Every job re-checks the switch (Settings), the Pixel ID, the token, the consent row and the order; if one is
  missing it writes a **SKIPPED** line with the reason (Admin → Marketing shows the log).
- Temporary Meta trouble → retried (5 tries); a wrong event or an expired token (code 190) → **FAILED** at once.
- Needs `META_CAPI_ACCESS_TOKEN` (server `.env`, secret). Without it, events are skipped, nothing breaks.
- Tests use a fake Meta — never graph.facebook.com.

## Not yet
- Sending newsletters (campaigns), one-click unsubscribe headers for bulk mail.
- An email when a review is approved (not in the spec).
