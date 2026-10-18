// Step 50 — CLAUDE.md §12: "Admin: receive order → update to shipped →
// customer email sent". The whole chain: the shop → the API → the queue →
// the real notification worker → an email in Mailpit.
import { ADMIN_URL, MAILPIT_URL } from '../support/env.js'
import { CUSTOMER, ORDERS_ADMIN } from '../support/fixtures.js'
import { buyShirtCashOnDelivery, firstAdminSignIn } from '../support/flows.js'
import { expect, test } from '../support/test.js'

interface MailpitSearch {
  messages: { Subject: string; To: { Address: string }[]; Created: string }[]
}

/** The emails in Mailpit whose subject contains these words (its search API). */
async function emailsAbout(words: string): Promise<MailpitSearch['messages']> {
  const query = encodeURIComponent(`subject:"${words}"`)
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
  if (!res.ok) throw new Error(`Mailpit answered ${res.status} — is it running?`)
  return ((await res.json()) as MailpitSearch).messages
}

test('an order marked shipped in the admin panel emails the customer', async ({ page }) => {
  // Order numbers start again on every run (the test database is reset), and
  // Mailpit keeps old emails — so only emails that arrive AFTER this moment count.
  const since = Date.now()

  // A customer places a cash-on-delivery order.
  const orderNumber = await buyShirtCashOnDelivery(page)

  // The admin finds it, confirms it, and marks it shipped with the courier's details.
  await firstAdminSignIn(page, ORDERS_ADMIN)
  await page.goto(`${ADMIN_URL}/admin/orders`)
  await page.getByRole('link', { name: orderNumber }).click()
  await expect(page.getByRole('heading', { name: new RegExp(orderNumber) })).toBeVisible()

  await page.getByRole('button', { name: 'Confirm order' }).click()
  await page.getByRole('button', { name: 'Confirm order' }).click() // the form's own button
  await expect(page.getByRole('button', { name: 'Mark shipped' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark shipped' }).click()
  await page.getByLabel('Courier').first().fill('Pathao')
  await page.getByLabel('Tracking number').first().fill('PTH-E2E-50')
  await page.getByRole('button', { name: 'Mark shipped' }).click() // the form's own button
  await expect(page.getByText('PTH-E2E-50').first()).toBeVisible()

  // The worker sends "Order NW-… is on its way" to the customer — within seconds.
  const subject = `Order ${orderNumber} is on its way`
  await expect
    .poll(
      async () =>
        (await emailsAbout(subject))
          .filter((m) => Date.parse(m.Created) >= since)
          .map((m) => m.To[0]?.Address),
      { timeout: 30_000 },
    )
    .toContain(CUSTOMER.email)
})
