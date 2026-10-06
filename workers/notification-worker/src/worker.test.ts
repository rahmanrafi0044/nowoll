// A real Redis queue and a real BullMQ worker: a job goes in, ONE email comes out.
import { randomUUID } from 'node:crypto'
import { RecordingEmailSender } from '@nowoll/email'
import {
  createNotificationsQueue,
  notificationJobId,
  producerConnection,
  workerConnection,
} from '@nowoll/queues'
import { QueueEvents } from 'bullmq'
import { db, resetDatabase, user } from '../test/db.js'
import { createNotificationWorker } from './worker.js'

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
