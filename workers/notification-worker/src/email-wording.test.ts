// Step 43b — the notification worker uses Admin → Content → Emails.
import { RecordingEmailSender } from '@nowoll/email'
import { db, resetDatabase, user } from '../test/db.js'
import { type Deps, handleNotificationJob } from './handle-job.js'

let sender: RecordingEmailSender
let deps: Deps
beforeEach(async () => {
  await resetDatabase()
  sender = new RecordingEmailSender()
  deps = { db, sender, siteUrl: 'https://nowoll.com' }
})
afterAll(() => db.$disconnect())

const wording = (data: object, isActive = true) =>
  db.contentBlock.create({ data: { key: 'email_wording', data: data as never, isActive } })

describe('email wording in real emails (step 43b)', () => {
  it('the saved wording is used: subject, heading, opening, footer', async () => {
    await wording({
      footer: 'Nowoll · Dhanmondi, Dhaka',
      emails: { welcome: { subject: 'Hello {name}!', intro: 'Glad you joined {store}.' } },
    })
    const u = await user({ fullName: 'Rafi Rahman' })
    await handleNotificationJob(
      { id: `welcome_${u.id}`, name: 'welcome', data: { userId: u.id } },
      deps,
    )
    const [email] = sender.sent
    expect(email).toMatchObject({ subject: 'Hello Rafi!' })
    expect(email!.text).toContain('Glad you joined Nowoll.')
    expect(email!.text).toContain('Nowoll · Dhanmondi, Dhaka')
  })

  it('cleared (switched off) or broken wording → the built-in email, never a failure', async () => {
    await wording({ emails: { welcome: { subject: 'Not used' } } }, false)
    const u = await user()
    await handleNotificationJob(
      { id: `welcome_${u.id}`, name: 'welcome', data: { userId: u.id } },
      deps,
    )
    expect(sender.sent[0]!.subject).toBe('Welcome to Nowoll')
  })

  it('"Send me a test": the example email with the given wording, marked [Test], to that admin only', async () => {
    const note = await handleNotificationJob(
      {
        name: 'email-test',
        data: {
          tag: 'order-shipped',
          to: 'admin@nowoll.com',
          wording: { emails: { 'order-shipped': { subject: '{order} is coming' } } },
        },
      },
      deps,
    )
    expect(note).toBe('sent test of order-shipped')
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0]).toMatchObject({
      to: 'admin@nowoll.com',
      subject: '[Test] NW-10001 is coming',
    })
  })
})
