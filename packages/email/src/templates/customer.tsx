import { Section } from '@react-email/components'
import type { ReactNode } from 'react'
import { StoreName } from '../brand.js'
import { formatBdt, formatDate, type Money } from '../format.js'
import { CallToAction, Heading, Layout, Note, P } from '../layout.js'
import type { EmailContent } from '../render.js'
import { type EmailOrderLine, type EmailTotals, OrderLines, Totals } from './order-parts.js'

// The customer emails from the spec's "Email Triggers" table (step 26).
// Every template is a plain function: data in, subject + email out.

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || 'there'
type Link = { url: string; label: string }

// ---- 1. Registration ---------------------------------------------------------
export function welcomeEmail(d: { name: string | null; shopUrl: string }): EmailContent {
  return {
    tag: 'welcome',
    subject: (store) => `Welcome to ${store.name}`,
    element: (
      <Layout preview="Your account is ready.">
        <Heading>Welcome, {firstName(d.name)}!</Heading>
        <P>
          Your account is ready. Your orders, saved addresses and wishlist now live in one place,
          and checkout fills itself in.
        </P>
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
    subject: `Order ${d.orderNumber} — thank you!`,
    element: (
      <Receipt
        d={d}
        preview={`We've got your order ${d.orderNumber}.`}
        heading={`Thank you, ${firstName(d.name)}!`}
        intro={
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
    subject: `Payment received — order ${d.orderNumber}`,
    element: (
      <Receipt
        d={d}
        preview={`We've received ${formatBdt(d.totals.total)} for order ${d.orderNumber}.`}
        heading="Payment received ✓"
        intro={
          <P>
            Thanks, {firstName(d.name)} — we&apos;ve received{' '}
            <strong>{formatBdt(d.totals.total)}</strong>. Your order is confirmed and we&apos;re
            getting it ready.
          </P>
        }
      />
    ),
  }
}

function Receipt({
  d,
  preview,
  heading,
  intro,
}: {
  d: ReceiptEmailData
  preview: string
  heading: string
  intro: ReactNode
}) {
  return (
    <Layout preview={preview}>
      <Heading>{heading}</Heading>
      <P>Order placed {formatDate(d.placedAt)}.</P>
      <Note>
        Order number: <strong>{d.orderNumber}</strong>
      </Note>
      {intro}
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
    subject: `Order ${d.orderNumber} is on its way`,
    element: (
      <Layout preview={`Your order ${d.orderNumber} has been handed to the courier.`}>
        <Heading>Your order is on its way</Heading>
        <P>
          Good news, {firstName(d.name)} — order <strong>{d.orderNumber}</strong> has left us.
        </P>
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
    subject: `Order ${d.orderNumber} has been delivered`,
    element: (
      <Layout preview="We hope you love it.">
        <Heading>Delivered — we hope you love it</Heading>
        <P>
          Order <strong>{d.orderNumber}</strong> has been delivered.
          {d.returnWindowDays > 0 &&
            ` Something not right? You can ask for a return within ${d.returnWindowDays} days.`}
        </P>
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
    subject: `Your return for order ${d.orderNumber} is approved`,
    element: (
      <Layout preview="Here's how to send your items back.">
        <Heading>Return approved</Heading>
        <P>Hi {firstName(d.name)}, we&apos;ve approved your return of:</P>
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
    subject: `About your return for order ${d.orderNumber}`,
    element: (
      <Layout preview="We couldn't accept this return.">
        <Heading>We couldn&apos;t accept this return</Heading>
        <P>
          Hi {firstName(d.name)}, we&apos;re sorry — we can&apos;t accept your return request for
          order {d.orderNumber}.
        </P>
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
    subject: `Refund of ${formatBdt(d.amount)} — order ${d.orderNumber}`,
    element: (
      <Layout preview={`We've refunded ${formatBdt(d.amount)}.`}>
        <Heading>Your refund is on its way</Heading>
        <P>
          Hi {firstName(d.name)}, we&apos;ve refunded <strong>{formatBdt(d.amount)}</strong> for
          order {d.orderNumber}.
        </P>
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
    subject: (store) => `Confirm your ${store.name} newsletter subscription`,
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
        <Heading>One click to confirm</Heading>
        <P>
          Please confirm you&apos;d like new arrivals and offers from <StoreName />. We email at
          most a few times a month.
        </P>
        <CallToAction href={d.confirmUrl}>Yes, subscribe me</CallToAction>
      </Layout>
    ),
  }
}
