import type { EmailKind } from '@nowoll/validation'
import { call } from '@/lib/api'
import type { AdminContentBlock } from '@/lib/content-api'

/** The saved wording, as stored (the private block "email_wording"). */
export type EmailWordingBlock = Omit<AdminContentBlock, 'key'> & { key: 'email_wording' }

// Admin → Content → Emails (step 43b) — apps/api/src/content/email-wording.controller.ts.

export const fetchEmailWording = () => call<EmailWordingBlock>('GET', '/admin/email-wording')

export const saveEmailWording = (data: unknown) =>
  call<EmailWordingBlock>('PUT', '/admin/email-wording', { data, isActive: true })

/** Back to the built-in wording everywhere. */
export const clearEmailWording = () => call<EmailWordingBlock>('DELETE', '/admin/email-wording')

/** The example email with this (maybe unsaved) wording, to the signed-in admin. */
export const sendTestEmail = (kind: EmailKind, wording: unknown) =>
  call<{ sentTo: string }>('POST', '/admin/email-wording/test', { kind, wording })
