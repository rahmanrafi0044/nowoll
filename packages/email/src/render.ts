import { render } from '@react-email/components'
import type { ReactElement } from 'react'

/** A template's output before rendering: the subject and the email itself. */
export interface EmailContent {
  subject: string
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
export async function renderEmail(content: EmailContent): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(content.element),
    render(content.element, { plainText: true }),
  ])
  return { subject: content.subject, html, text, tag: content.tag }
}
