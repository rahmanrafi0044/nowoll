// The notification worker process (CLAUDE.md §10) — `pnpm dev` runs it next to
// the apps; production runs it as its own Docker container (step 44).
import { createPrismaClient } from '@nowoll/database'
import { emailSenderFromEnv } from '@nowoll/email'
import { workerConnection } from '@nowoll/queues'
import { parseEnv } from './env.js'
import { createNotificationWorker } from './worker.js'

const env = parseEnv(process.env)
const db = createPrismaClient(env.DATABASE_URL)
const sender = emailSenderFromEnv(env)
const connection = workerConnection(env.REDIS_URL)
const worker = createNotificationWorker(
  { db, sender, siteUrl: env.NEXT_PUBLIC_SITE_URL },
  connection,
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
  await worker.close()
  await connection.quit().catch(() => {})
  await db.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))
