// A real Redis queue and a real BullMQ worker: a job goes in, ONE email comes out.
import { randomUUID } from 'node:crypto'
import { RecordingEmailSender } from '@nowoll/email'
import {
  createMarketingQueue,
  createNotificationsQueue,
  metaEventJobId,
  notificationJobId,
  producerConnection,
  workerConnection,
} from '@nowoll/queues'
import { QueueEvents } from 'bullmq'
import { db, order, resetDatabase, user } from '../test/db.js'
import type { MetaSenderLike } from './marketing-job.js'
import { createMarketingWorker, createNotificationWorker } from './worker.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const prefix = `test-${randomUUID()}`
const producer = producerConnection(REDIS_URL)
const queue = createNotificationsQueue(producer, prefix)
const events = new QueueEvents('notifications', { connection: workerConnection(REDIS_URL), prefix })
const sender = new RecordingEmailSender()
const connection = workerConnection(REDIS_URL)
const worker = createNotificationWorker({ db, sender, siteUrl: 'https://nowoll.com' }, connection, {
  prefix,
})

beforeAll(() => events.waitUntilReady())
beforeEach(() => resetDatabase())
afterAll(async () => {
  await worker.close()
  await queue.obliterate({ force: true })
  await queue.close()
  await events.close()
  await Promise.all([producer.quit(), connection.quit()])
  await db.$disconnect()
})

it('a welcome job → one welcome email, even if added twice', async () => {
  const u = await user()
  const jobId = notificationJobId('welcome', u.id)
  const job = await queue.add('welcome', { userId: u.id }, { jobId })
  await queue.add('welcome', { userId: u.id }, { jobId })
  await job.waitUntilFinished(events, 10_000)
  expect(sender.sent.map((e) => [e.to, e.subject])).toEqual([
    ['rafi@example.com', 'Welcome to Nowoll'],
  ])
})

it('marketing (step 39b): a Meta job, added twice → sent ONCE, logged', async () => {
  const sent: string[] = []
  const meta: MetaSenderLike = {
    tokenSet: true,
    send: async (_pixel, events) => {
      sent.push(events[0]!.event_id)
      return { ok: true, eventsReceived: 1, messages: [], fbtraceId: null }
    },
  }
  const mQueue = createMarketingQueue(producer, prefix)
  const mEvents = new QueueEvents('marketing', { connection: workerConnection(REDIS_URL), prefix })
  const mConnection = workerConnection(REDIS_URL)
  const mWorker = createMarketingWorker({ db, meta }, mConnection, { prefix })
  try {
    await mEvents.waitUntilReady()
    for (const [key, value] of [
      ['meta_capi_enabled', true],
      ['meta_pixel_id', '123456789012345'],
    ] as const)
      await db.setting.create({ data: { key, value } })
    const o = await order({
      status: 'CONFIRMED',
      tracking: {
        create: {
          clientIp: '103.4.145.2',
          userAgent: 'Mozilla/5.0',
          sourceUrl: 'https://nowoll.com/checkout',
        },
      },
    })
    const jobId = metaEventJobId('purchase', o.orderNumber)
    const job = await mQueue.add('meta-event', { kind: 'purchase', orderId: o.id }, { jobId })
    await mQueue.add('meta-event', { kind: 'purchase', orderId: o.id }, { jobId })
    await job.waitUntilFinished(mEvents, 10_000)
    expect(sent).toEqual([`purchase-NW-${o.orderNumber}`])
    expect(await db.metaEvent.count({ where: { status: 'SENT' } })).toBe(1)
  } finally {
    await mWorker.close()
    await mQueue.obliterate({ force: true })
    await mQueue.close()
    await mEvents.close()
    await mConnection.quit()
  }
})
