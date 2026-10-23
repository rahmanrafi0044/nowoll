import { Section } from '@react-email/components'
import { type ReactNode, useContext } from 'react'
import { fill, type StoreBrand, StoreContext, StoreName } from '../brand.js'
import { formatBdt, formatDate, type Money } from '../format.js'
import { CallToAction, Heading, Layout, Note, P } from '../layout.js'
import type { EmailContent } from '../render.js'
import { type EmailOrderLine, type EmailTotals, OrderLines, Totals } from './order-parts.js'

// The customer emails from the spec's "Email Triggers" table (step 26).
// Every template is a plain function: data in, subject + email out.

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || 'there'
type Link = { url: string; label: string }
type Vars = Partial<Record<'name' | 'order' | 'amount' | 'product', string>>

// ---- Admin → Content → Emails (step 43b) ------------------------------------------
// The admin may replace the SUBJECT, HEADING and OPENING paragraph of each email
// (plain text, {placeholders} filled in). Everything else — amounts, receipt,
// tracking, instructions, buttons, links — stays as written here. Where the
// built-in opening carried a fact, that fact gets its own line (`facts`) once
// the admin's opening replaces it, so no fact is ever lost.

/** The subject: the admin's (placeholders filled) or the built-in one. */
const worded =
  (tag: string, vars: Vars, fallback: string | ((store: StoreBrand) => string)) =>
  (store: StoreBrand) => {
    const custom = store.wording?.[tag]?.subject?.trim()
    if (custom) return fill(custom, { ...vars, store: store.name })
    return typeof fallback === 'function' ? fallback(store) : fallback
  }

interface OpeningProps {
  tag: string
  vars: Vars
  heading: ReactNode
  /** The built-in opening (null = none: the admin's opening is simply added). */
  intro?: ReactNode
  /** Facts from the built-in opening, shown when the admin's opening replaces it. */
  facts?: ReactNode
}

/** Heading + opening paragraph, together. */
function Opening(props: OpeningProps) {
  return (
    <>
      <OpeningHeading {...props} />
      <OpeningIntro {...props} />
    </>
  )
}

function OpeningHeading({ tag, vars, heading }: OpeningProps) {
  const store = useContext(StoreContext)
  const own = store.wording?.[tag]?.heading?.trim()
  return <Heading>{own ? fill(own, { ...vars, store: store.name }) : heading}</Heading>
}

function OpeningIntro({ tag, vars, intro = null, facts = null }: OpeningProps) {
  const store = useContext(StoreContext)
  const own = store.wording?.[tag]?.intro?.trim()
  if (!own) return <>{intro}</>
  return (
    <>
      {fill(own, { ...vars, store: store.name })
        .split(/\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <P key={i}>{p}</P>
        ))}
      {facts}
    </>
  )
}

// ---- 1. Registration ---------------------------------------------------------
export function welcomeEmail(d: { name: string | null; shopUrl: string }): EmailContent {
  return {
    tag: 'welcome',
    subject: worded('welcome', { name: firstName(d.name) }, (store) => `Welcome to ${store.name}`),
    element: (
      <Layout preview="Your account is ready.">
        <Opening
          tag="welcome"
          vars={{ name: firstName(d.name) }}
          heading={`Welcome, ${firstName(d.name)}!`}
          intro={
            <P>
              Your account is ready. Your orders, saved addresses and wishlist now live in one
              place, and checkout fills itself in.
            </P>
          }
        />
        <CallToAction href={d.shopUrl}>Start shopping</CallToAction>
      </Layout>
    ),
  }
}

// ---- 2 + 3. Order receipt: cash order placed / online payment confirmed ------------
/** What both receipt emails show. */
export interface ReceiptEmailData {
  name: string
  orderNumber: string
  placedAt: string
  lines: EmailOrderLine[]
  totals: EmailTotals
  address: string
  link: Link
}

/** Cash on delivery: sent when the order is placed. */
export function orderConfirmationEmail(
  d: ReceiptEmailData & { paymentMethod: 'COD' | 'SSLCOMMERZ' },
): EmailContent {
  const cod = d.paymentMethod === 'COD'
  return {
    tag: 'order-confirmation',
    subject: worded('order-confirmation', vars(d), `Order ${d.orderNumber} — thank you!`),
    element: (
      <Receipt
        d={d}
        tag="order-confirmation"
        preview={`We've got your order ${d.orderNumber}.`}
        heading={`Thank you, ${firstName(d.name)}!`}
        facts={
          cod ? (
            <P>
              We&apos;ll call you shortly to confirm. Please pay{' '}
              <strong>{formatBdt(d.totals.total)}</strong> in cash when your parcel arrives.
            </P>
          ) : (
            <P>We&apos;ll email you again as soon as your online payment is confirmed.</P>
          )
        }
      />
    ),
  }
}

/**
 * Online payment confirmed (SSLCommerz): the ONLY email an online order gets
 * at checkout (step 27 decision #2) — so it carries the full receipt.
 */
export function paymentConfirmedEmail(d: ReceiptEmailData): EmailContent {
  return {
    tag: 'payment-confirmed',
    subject: worded(
      'payment-confirmed',
      { ...vars(d), amount: formatBdt(d.totals.total) },
      `Payment received — order ${d.orderNumber}`,
    ),
    element: (
      <Receipt
        d={d}
        tag="payment-confirmed"
        amount={formatBdt(d.totals.total)}
        preview={`We've received ${formatBdt(d.totals.total)} for order ${d.orderNumber}.`}
        heading="Payment received ✓"
        intro={
          <P>
            Thanks, {firstName(d.name)} — we&apos;ve received{' '}
            <strong>{formatBdt(d.totals.total)}</strong>. Your order is confirmed and we&apos;re
            getting it ready.
          </P>
        }
        replacedFacts={
          <Note>
            Paid: <strong>{formatBdt(d.totals.total)}</strong>
          </Note>
        }
      />
    ),
  }
}

const vars = (d: { name: string; orderNumber: string }): Vars => ({
  name: firstName(d.name),
  order: d.orderNumber,
})

function Receipt({
  d,
  tag,
  amount,
  preview,
  heading,
  intro = null,
  replacedFacts = null,
  facts = null,
}: {
  d: ReceiptEmailData
  tag: string
  amount?: string
  preview: string
  heading: string
  /** The built-in opening (replaceable by the admin's). */
  intro?: ReactNode
  /** Its facts, shown when the admin's opening replaces it. */
  replacedFacts?: ReactNode
  /** Always shown (e.g. "pay ৳X in cash when your parcel arrives"). */
  facts?: ReactNode
}) {
  const opening: OpeningProps = {
    tag,
    vars: { ...vars(d), ...(amount && { amount }) },
    heading,
    intro,
    facts: replacedFacts,
  }
  return (
    <Layout preview={preview}>
      <OpeningHeading {...opening} />
      <P>Order placed {formatDate(d.placedAt)}.</P>
      <Note>
        Order number: <strong>{d.orderNumber}</strong>
      </Note>
      <OpeningIntro {...opening} />
      {facts}
      <OrderLines lines={d.lines} />
      <Totals totals={d.totals} />
      <Section style={{ marginTop: '20px' }}>
        <P muted>Delivering to: {d.address}</P>
      </Section>
      <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
    </Layout>
  )
}

// ---- 4. Shipped ------------------------------------------------------------------
export function orderShippedEmail(d: {
  name: string
  orderNumber: string
  courierName: string | null
  trackingNumber: string | null
  link: Link
}): EmailContent {
  return {
    tag: 'order-shipped',
    subject: worded('order-shipped', vars(d), `Order ${d.orderNumber} is on its way`),
    element: (
      <Layout preview={`Your order ${d.orderNumber} has been handed to the courier.`}>
        <Opening
          tag="order-shipped"
          vars={vars(d)}
          heading="Your order is on its way"
          intro={
            <P>
              Good news, {firstName(d.name)} — order <strong>{d.orderNumber}</strong> has left us.
            </P>
          }
          facts={<OrderNumber n={d.orderNumber} />}
        />
        {d.trackingNumber && (
          <Note>
            Courier: <strong>{d.courierName ?? 'our courier'}</strong>
            <br />
            Tracking number: <strong>{d.trackingNumber}</strong>
          </Note>
        )}
        <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
      </Layout>
    ),
  }
}

// ---- 5. Delivered ------------------------------------------------------------------
export function orderDeliveredEmail(d: {
  name: string
  orderNumber: string
  link: Link
  returnWindowDays: number
}): EmailContent {
  return {
    tag: 'order-delivered',
    subject: worded('order-delivered', vars(d), `Order ${d.orderNumber} has been delivered`),
    element: (
      <Layout preview="We hope you love it.">
        <Opening
          tag="order-delivered"
          vars={vars(d)}
          heading="Delivered — we hope you love it"
          intro={
            <P>
              Order <strong>{d.orderNumber}</strong> has been delivered.
              {d.returnWindowDays > 0 &&
                ` Something not right? You can ask for a return within ${d.returnWindowDays} days.`}
            </P>
          }
          facts={
            <>
              <OrderNumber n={d.orderNumber} />
              {d.returnWindowDays > 0 && (
                <P>
                  Something not right? You can ask for a return within {d.returnWindowDays} days.
                </P>
              )}
            </>
          }
        />
        <P muted>
          Tell other shoppers what you think — you can review your items from your order page.
        </P>
        <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
      </Layout>
    ),
  }
}

// ---- 6. Return approved ------------------------------------------------------------
export function returnApprovedEmail(d: {
  name: string
  orderNumber: string
  lines: Omit<EmailOrderLine, 'lineTotal'>[]
  instructions: string
  link: Link
}): EmailContent {
  return {
    tag: 'return-approved',
    subject: worded(
      'return-approved',
      vars(d),
      `Your return for order ${d.orderNumber} is approved`,
    ),
    element: (
      <Layout preview="Here's how to send your items back.">
        <Opening
          tag="return-approved"
          vars={vars(d)}
          heading="Return approved"
          intro={<P>Hi {firstName(d.name)}, we&apos;ve approved your return of:</P>}
          facts={
            <>
              <OrderNumber n={d.orderNumber} />
              <P>Items to return:</P>
            </>
          }
        />
        <OrderLines lines={d.lines.map((l) => ({ ...l, lineTotal: '0' }))} showPrices={false} />
        <P>
          <strong>What to do next:</strong>
        </P>
        <Note>{d.instructions}</Note>
        <P muted>Your refund follows once the items reach us.</P>
        <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
      </Layout>
    ),
  }
}

// ---- 7. Return rejected ------------------------------------------------------------
export function returnRejectedEmail(d: {
  name: string
  orderNumber: string
  reason: string
  link: Link
}): EmailContent {
  return {
    tag: 'return-rejected',
    subject: worded('return-rejected', vars(d), `About your return for order ${d.orderNumber}`),
    element: (
      <Layout preview="We couldn't accept this return.">
        <Opening
          tag="return-rejected"
          vars={vars(d)}
          heading="We couldn’t accept this return"
          intro={
            <P>
              Hi {firstName(d.name)}, we&apos;re sorry — we can&apos;t accept your return request
              for order {d.orderNumber}.
            </P>
          }
          facts={<OrderNumber n={d.orderNumber} />}
        />
        <Note>{d.reason}</Note>
        <P muted>Questions? Just reply to this email.</P>
        <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
      </Layout>
    ),
  }
}

// ---- 8. Refund processed ------------------------------------------------------------
export function refundProcessedEmail(d: {
  name: string
  orderNumber: string
  amount: Money
  method: 'GATEWAY' | 'MANUAL'
  link: Link
}): EmailContent {
  return {
    tag: 'refund-processed',
    subject: worded(
      'refund-processed',
      { ...vars(d), amount: formatBdt(d.amount) },
      `Refund of ${formatBdt(d.amount)} — order ${d.orderNumber}`,
    ),
    element: (
      <Layout preview={`We've refunded ${formatBdt(d.amount)}.`}>
        <Opening
          tag="refund-processed"
          vars={{ ...vars(d), amount: formatBdt(d.amount) }}
          heading="Your refund is on its way"
          intro={
            <P>
              Hi {firstName(d.name)}, we&apos;ve refunded <strong>{formatBdt(d.amount)}</strong> for
              order {d.orderNumber}.
            </P>
          }
          facts={
            <Note>
              Refunded: <strong>{formatBdt(d.amount)}</strong> for order{' '}
              <strong>{d.orderNumber}</strong>
            </Note>
          }
        />
        <P muted>
          {d.method === 'GATEWAY'
            ? 'It goes back to the card or wallet you paid with. Banks usually take 7–10 working days to show it.'
            : "We've sent it to you directly, as arranged with you."}
        </P>
        <CallToAction href={d.link.url}>{d.link.label}</CallToAction>
      </Layout>
    ),
  }
}

// ---- 9. Newsletter sign-up (double opt-in) -------------------------------------------
export function newsletterConfirmEmail(d: {
  confirmUrl: string
  unsubscribeUrl: string
}): EmailContent {
  return {
    tag: 'newsletter-confirm',
    subject: worded(
      'newsletter-confirm',
      {},
      (store) => `Confirm your ${store.name} newsletter subscription`,
    ),
    element: (
      <Layout
        preview="One click to confirm."
        footer={
          <>
            You received this because this address was entered on our newsletter form. Not you?
            Ignore this email — or <a href={d.unsubscribeUrl}>unsubscribe</a>.
          </>
        }
      >
        <Opening
          tag="newsletter-confirm"
          vars={{}}
          heading="One click to confirm"
          intro={
            <P>
              Please confirm you&apos;d like new arrivals and offers from <StoreName />. We email at
              most a few times a month.
            </P>
          }
        />
        <CallToAction href={d.confirmUrl}>Yes, subscribe me</CallToAction>
      </Layout>
    ),
  }
}

/** The order number on its own line (a fact kept when the admin replaces the opening). */
function OrderNumber({ n }: { n: string }) {
  return (
    <Note>
      Order number: <strong>{n}</strong>
    </Note>
  )
}

// ---- 38f. Back in stock ("Notify me when it's back") --------------------------------
/**
 * One sold-out size is back. Sent once to each person who asked; they need no
 * account, and nothing else is ever sent to them because of it.
 */
export function backInStockEmail(d: {
  productName: string
  variantLabel: string
  price: Money
  productUrl: string
}): EmailContent {
  const product = `${d.productName} (${d.variantLabel})`
  return {
    tag: 'back-in-stock',
    subject: worded('back-in-stock', { product }, `Back in stock: ${product}`),
    element: (
      <Layout preview={`${product} is available again.`}>
        <Opening
          tag="back-in-stock"
          vars={{ product }}
          heading="It’s back"
          intro={
            <P>
              You asked us to tell you: <strong>{d.productName}</strong> in{' '}
              <strong>{d.variantLabel}</strong> is available again. Sizes go quickly, so don’t wait
              too long.
            </P>
          }
          facts={
            <P>
              <strong>{product}</strong>
            </P>
          }
        />
        <Note>
          Price: <strong>{formatBdt(d.price)}</strong>
        </Note>
        <CallToAction href={d.productUrl}>Shop it now</CallToAction>
        <P muted>
          You get this email once, because you asked on our website. We won’t email you about it
          again.
        </P>
      </Layout>
    ),
  }
}
