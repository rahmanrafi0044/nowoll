import { ResendEmailSender } from './resend.js'
import { SmtpEmailSender } from './smtp.js'
import type { EmailSender } from './types.js'

export interface EmailEnv {
  NODE_ENV?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
}

/** The .env.example placeholder ("re_your_api_key") isn't a key. */
export const isResendConfigured = (key?: string) =>
  !!key && key.startsWith('re_') && !/your/i.test(key)

/**
 * Picks the sender from the environment:
 *   production  → Resend (required — refuses to start without a real key)
 *   otherwise   → Mailpit via SMTP_HOST/SMTP_PORT (default localhost:1025)
 * A real Resend key in development is NOT used unless EMAIL_USE_RESEND is set
 * — so a developer can never email real customers by accident.
 */
export function emailSenderFromEnv(env: EmailEnv & { EMAIL_USE_RESEND?: string }): EmailSender {
  const from = env.EMAIL_FROM || 'Nowoll <orders@localhost>'
  if (env.NODE_ENV === 'production' || env.EMAIL_USE_RESEND === 'true') {
    if (!isResendConfigured(env.RESEND_API_KEY))
      throw new Error(
        'RESEND_API_KEY must be set to a real Resend key to send email in production.',
      )
    return new ResendEmailSender(env.RESEND_API_KEY!, from)
  }
  return new SmtpEmailSender(env.SMTP_HOST || 'localhost', Number(env.SMTP_PORT || 1025), from)
}
