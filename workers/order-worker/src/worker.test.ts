// The whole path with a REAL Redis queue and a REAL BullMQ worker: a job goes
// in, an email comes out — once, retried when it should be, not when it shouldn't.
import { randomUUID } from 'node:crypto'
import { RecordingEmailSender } from '@nowoll/email'
import { createOrdersQueue, orderJobId, producerConnection, workerConnection } from '@nowoll/queues'
import { QueueEvents } from 'bullmq'
import { db, makeOrder, resetDatabase } from '../test/db.js'
import { createOrderWorker } from './worker.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const prefix = `test-${randomUUID()}`
const producer = producerConnection(REDIS_URL)
const queue = createOrdersQueue(producer, prefix)
const events = new QueueEvents('orders', { connection: workerConnection(REDIS_URL), prefix })
const sender = new RecordingEmailSender()
const connection = workerConnection(REDIS_URL)
const worker = createOrderWorker(
  {
    db,
    sender,
    siteUrl: 'https://nowoll.com',
    adminUrl: 'https://admin.nowoll.com',
    adminEmail: 'rafi@nowoll.com',
  },
  connection,
  { prefix },
)

beforeAll(() => events.waitUntilReady())
beforeEach(async () => {
  await resetDatabase()
  sender.sent.length = 0
  sender.failWith = null
})
afterAll(async () => {
  await worker.close()
  await queue.obliterate({ force: true })
  await queue.close()
  await events.close()
  await Promise.all([producer.quit(), connection.quit()])
  await db.$disconnect()
})

// Fast retries for tests: 3 tries, 50 ms apart (production: 5 tries from 30 s).
const quick = { attempts: 3, backoff: { type: 'fixed' as const, delay: 50 } }

it('a cash order job → one confirmation email; the same job added twice → still one', async () => {
  const order = await makeOrder()
  const jobId = orderJobId('order-confirmation', order.orderNumber)
  const job = await queue.add('order-confirmation', { orderId: order.id }, { jobId, ...quick })
  await queue.add('order-confirmation', { orderId: order.id }, { jobId, ...quick })
  await job.waitUntilFinished(events, 10_000)
  expect(sender.sent.map((e) => e.subject)).toEqual(['Order NW-10001 — thank you!'])
})

it('a temporary failure is retried, then succeeds — one email', async () => {
  const order = await makeOrder()
  let failures = 1
  const original = sender.send.bind(sender)
  sender.send = async (email) =>
    failures-- > 0 ? { ok: false, reason: 'Resend 503', retryable: true } : original(email)
  const job = await queue.add(
    'order-confirmation',
    { orderId: order.id },
    { jobId: `retry_${randomUUID()}`, ...quick },
  )
  await job.waitUntilFinished(events, 10_000)
  expect(sender.sent).toHaveLength(1)
  expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2)
  sender.send = original
})

it('a hopeless email is NOT retried — the job fails after one try', async () => {
  const order = await makeOrder()
  sender.failWith = { ok: false, reason: 'Resend 422: invalid `to`', retryable: false }
  const job = await queue.add(
    'order-confirmation',
    { orderId: order.id },
    { jobId: `bad_${randomUUID()}`, ...quick },
  )
  await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/invalid/)
  const after = await queue.getJob(job.id!)
  expect(after?.attemptsMade).toBe(1)
  expect(await after?.getState()).toBe('failed')
})
