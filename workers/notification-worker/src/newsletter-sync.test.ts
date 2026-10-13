// Step 42 — newsletter → Resend, against a FAKE Resend (never the real one).
import type { ContactSyncResult } from '@nowoll/email'
import { UnrecoverableError } from 'bullmq'
import { db, resetDatabase } from '../test/db.js'
import { handleNotificationJob } from './handle-job.js'
import { type ContactsLike, needsSync, syncAll } from './newsletter-sync.js'

const SEG = '78261eea-8f8b-4381-83c6-79fa7120f1cf'

class FakeResend implements ContactsLike {
  calls: string[] = []
  answers: ContactSyncResult[] = []
  private answer() {
    return this.answers.shift() ?? { ok: true }
  }
  async subscribe(email: string, segmentId: string) {
    this.calls.push(`subscribe ${email} ${segmentId}`)
    return this.answer()
  }
  async unsubscribe(email: string) {
    this.calls.push(`unsubscribe ${email}`)
    return this.answer()
  }
  async remove(email: string) {
    this.calls.push(`remove ${email}`)
    return this.answer()
  }
}

let resend: FakeResend
const deps = () => ({ db, sender: null as never, siteUrl: 'https://nowoll.com', contacts: resend })
const sync = (subscriberId: string, attempt: { attemptsMade?: number } = {}) =>
  handleNotificationJob(
    { name: 'newsletter-sync', data: { subscriberId }, opts: { attempts: 5 }, ...attempt },
    deps(),
  )

async function settings(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values))
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    })
}
const subscriber = (fields: Record<string, unknown> = {}) =>
  db.subscriber.create({
    data: {
      email: `s${Math.random().toString(36).slice(2, 8)}@example.com`,
      status: 'SUBSCRIBED',
      confirmedAt: new Date('2026-10-01T00:00:00Z'),
      ...fields,
    },
  })

beforeEach(async () => {
  await resetDatabase()
  resend = new FakeResend()
  await settings({ newsletter_resend_enabled: true, newsletter_resend_segment_id: SEG })
})
afterAll(() => db.$disconnect())

describe('one subscriber', () => {
  it('confirmed → into the segment; marked synced; no error', async () => {
    const s = await subscriber()
    expect(await sync(s.id)).toBe('synced subscribed')
    expect(resend.calls).toEqual([`subscribe ${s.email} ${SEG}`])
    const after = await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.resendSyncedAt).not.toBeNull()
    expect(after.resendError).toBeNull()
    expect(await sync(s.id)).toBe('already up to date') // nothing sent twice
    expect(resend.calls).toHaveLength(1)
  })

  it('unsubscribed after being copied → unsubscribed in Resend', async () => {
    const s = await subscriber({
      status: 'UNSUBSCRIBED',
      resendSyncedAt: new Date('2026-10-02T00:00:00Z'),
      unsubscribedAt: new Date('2026-10-05T00:00:00Z'),
    })
    await sync(s.id)
    expect(resend.calls).toEqual([`unsubscribe ${s.email}`])
  })

  it('never copied: unsubscribed or still waiting for confirmation → nothing sent to Resend', async () => {
    const gone = await subscriber({ status: 'UNSUBSCRIBED', unsubscribedAt: new Date() })
    const waiting = await subscriber({ status: 'PENDING', confirmedAt: null })
    expect(await sync(gone.id)).toBe('already up to date')
    expect(await sync(waiting.id)).toBe('already up to date')
    expect(resend.calls).toEqual([])
  })

  it('switched off, no segment, or no Resend here (development) → skipped, untouched', async () => {
    const s = await subscriber()
    await settings({ newsletter_resend_enabled: false })
    expect(await sync(s.id)).toMatch(/switched off/)
    await settings({ newsletter_resend_enabled: true, newsletter_resend_segment_id: '' })
    expect(await sync(s.id)).toMatch(/segment/)
    await settings({ newsletter_resend_segment_id: SEG })
    expect(
      await handleNotificationJob(
        { name: 'newsletter-sync', data: { subscriberId: s.id } },
        { ...deps(), contacts: null },
      ),
    ).toMatch(/not used here/)
    expect(resend.calls).toEqual([])
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })).resendSyncedAt,
    ).toBeNull()
  })

  it('a key problem → kept on the subscriber (shown in the admin), not retried', async () => {
    const s = await subscriber()
    resend.answers = [
      { ok: false, retry: false, keyProblem: true, message: 'Resend refused the API key' },
    ]
    await expect(sync(s.id)).rejects.toBeInstanceOf(UnrecoverableError)
    expect((await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })).resendError).toBe(
      'Resend refused the API key',
    )
  })

  it('temporary trouble → retried; the error is only kept after the last try', async () => {
    const s = await subscriber()
    const busy = { ok: false as const, retry: true, keyProblem: false, message: 'Resend 429' }
    resend.answers = [busy, busy]
    await expect(sync(s.id)).rejects.not.toBeInstanceOf(UnrecoverableError)
    expect((await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })).resendError).toBeNull()
    await expect(sync(s.id, { attemptsMade: 4 })).rejects.toBeInstanceOf(UnrecoverableError)
    expect((await db.subscriber.findUniqueOrThrow({ where: { id: s.id } })).resendError).toBe(
      'Resend 429',
    )
  })

  it('erase: removed in Resend even if copying is now off', async () => {
    await settings({ newsletter_resend_enabled: false })
    await handleNotificationJob(
      { name: 'newsletter-erase', data: { email: 'gone@example.com' } },
      deps(),
    )
    expect(resend.calls).toEqual(['remove gone@example.com'])
  })
})

describe('sync everyone', () => {
  it('only those out of date; a failure is recorded and the rest continue', async () => {
    const a = await subscriber()
    const b = await subscriber()
    await subscriber({ resendSyncedAt: new Date('2026-10-03T00:00:00Z') }) // up to date
    await subscriber({ status: 'PENDING', confirmedAt: null })
    resend.answers = [{ ok: false, retry: false, keyProblem: false, message: 'Resend 422: odd' }]
    expect(await syncAll({ db, contacts: resend })).toBe('synced 1, failed 1')
    expect(resend.calls.map((c) => c.split(' ')[1]).sort()).toEqual([a.email, b.email].sort())
  })

  it('Resend says "slow down" → stops, to be tried again later', async () => {
    await subscriber()
    await subscriber()
    resend.answers = [{ ok: false, retry: true, keyProblem: false, message: 'Resend 429' }]
    await expect(syncAll({ db, contacts: resend })).rejects.toThrow('Resend 429')
    expect(resend.calls).toHaveLength(1)
  })
})

describe('needsSync', () => {
  const base = { confirmedAt: null, unsubscribedAt: null, resendSyncedAt: null, resendError: null }
  it('re-confirmed after the last copy → out of date again', () => {
    expect(
      needsSync({
        ...base,
        status: 'SUBSCRIBED',
        confirmedAt: new Date('2026-10-05'),
        resendSyncedAt: new Date('2026-10-01'),
      }),
    ).toBe(true)
    expect(needsSync({ ...base, status: 'PENDING', resendError: 'x' })).toBe(true)
  })
})
