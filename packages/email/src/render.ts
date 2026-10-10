import { render } from '@react-email/components'
import { createElement, type ReactElement } from 'react'
import { DEFAULT_STORE, type StoreBrand, StoreContext } from './brand.js'

/** A template's output before rendering: the subject and the email itself. */
export interface EmailContent {
  /** A function when the subject names the store (it comes from Admin → Settings). */
  subject: string | ((store: StoreBrand) => string)
  element: ReactElement
  /** A label for Resend's dashboard and our logs, e.g. "order-confirmation". */
  tag: string
}

export interface RenderedEmail {
  subject: string
  html: string
  /** Plain-text version — some people read mail as text, and it helps keep emails out of spam. */
  text: string
  tag: string
}

/**
 * React → email HTML (inline styles, tables — what email apps understand) and
 * plain text. Everything a customer typed is ESCAPED by React: a name like
 * "<script>" shows as text, it never becomes HTML.
 */
export async function renderEmail(
  content: EmailContent,
  store: StoreBrand = DEFAULT_STORE,
): Promise<RenderedEmail> {
  const element = createElement(StoreContext.Provider, { value: store }, content.element)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  const subject = typeof content.subject === 'function' ? content.subject(store) : content.subject
  return { subject, html, text, tag: content.tag }
}
