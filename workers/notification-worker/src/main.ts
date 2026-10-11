// The notification worker process (CLAUDE.md §10) — `pnpm dev` runs it next to
// the apps; production runs it as its own Docker container (step 44).
import { type FetchLike, sendToMeta } from '@nowoll/analytics/server'
import { createPrismaClient } from '@nowoll/database'
import { emailSenderFromEnv } from '@nowoll/email'
import { createMarketingQueue, producerConnection, workerConnection } from '@nowoll/queues'
import { parseEnv } from './env.js'
import type { MetaSenderLike } from './marketing-job.js'
import { createMarketingWorker, createNotificationWorker } from './worker.js'

const env = parseEnv(process.env)
const db = createPrismaClient(env.DATABASE_URL)
const sender = emailSenderFromEnv(env)
const connection = workerConnection(env.REDIS_URL)
const worker = createNotificationWorker(
  { db, sender, siteUrl: env.NEXT_PUBLIC_SITE_URL },
  connection,
)

// Meta Conversions API (step 39b): the token stays in this process — never logged.
const token = env.META_CAPI_ACCESS_TOKEN
const meta: MetaSenderLike = {
  tokenSet: !!token,
  send: (pixelId, events) =>
    sendToMeta({ pixelId, accessToken: token ?? '', events, fetch: fetch as unknown as FetchLike }),
}
const marketingConnection = workerConnection(env.REDIS_URL)
const marketingWorker = createMarketingWorker({ db, meta }, marketingConnection)

// The daily clean-up of saved browser details (60 days) — one schedule, however often we restart.
const schedulerConnection = producerConnection(env.REDIS_URL)
const marketingQueue = createMarketingQueue(schedulerConnection)
void marketingQueue
  .upsertJobScheduler(
    'tracking-cleanup',
    { every: 24 * 60 * 60 * 1000 },
    { name: 'tracking-cleanup', data: {} },
  )
  .catch((e: unknown) =>
    console.error(`[notification-worker] could not schedule clean-up: ${String(e)}`),
  )

console.log(
  `[notification-worker] running — emails via ${sender.name}${sender.name === 'smtp' ? ' (Mailpit: http://localhost:8025)' : ''}`,
)

// Graceful shutdown: finish the job in hand, then close (SIGTERM from Docker, Ctrl+C locally).
let stopping = false
async function stop(signal: string) {
  if (stopping) return
  stopping = true
  console.log(`[notification-worker] ${signal} — finishing current jobs…`)
  await Promise.all([worker.close(), marketingWorker.close()])
  await marketingQueue.close().catch(() => {})
  await Promise.all(
    [connection, marketingConnection, schedulerConnection].map((c) => c.quit().catch(() => {})),
  )
  await db.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))
