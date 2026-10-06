import { BRAND } from '../brand.js'
import { CallToAction, Heading, Layout, P } from '../layout.js'
import type { EmailContent } from '../render.js'

// ---- 11. Password reset — sent by SUPABASE, not by us ---------------------------
// Supabase fills in {{ .RedirectTo }} and {{ .TokenHash }} itself (its email
// templates are Go templates). This renders the HTML to paste into Supabase →
// Authentication → Email Templates → Reset Password. The committed copy lives in
// docs/integrations/supabase-reset-password.html; a test keeps it up to date.
export const SUPABASE_RESET_LINK = '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery'

export function supabaseResetPasswordEmail(): EmailContent {
  return {
    tag: 'reset-password',
    subject: `Reset your ${BRAND.name} password`,
    element: (
      <Layout
        preview="Choose a new password."
        footer="Didn't ask for this? You can ignore this email — your password stays the same."
      >
        <Heading>Choose a new password</Heading>
        <P>Someone (hopefully you) asked to reset the password for this {BRAND.name} account.</P>
        <CallToAction href={SUPABASE_RESET_LINK}>Choose a new password</CallToAction>
        <P muted>
          The link works once and expires after a while. If it has, ask for a new one on the sign-in
          page.
        </P>
      </Layout>
    ),
  }
}
