// ============================================================================
// pnpm email:preview — see every Nowoll email in your browser.
//   1. Renders all templates with example data (src/examples.tsx).
//   2. Sends each to Mailpit (docker compose up -d mailpit) → open
//      http://localhost:8025. Nothing reaches a real inbox: Mailpit catches all.
//   3. Writes the password-reset design to docs/integrations/supabase-reset-password.html,
//      ready to paste into Supabase → Authentication → Email Templates → Reset Password.
// --no-send: only step 3.
// ============================================================================
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { EXAMPLES } from '../src/examples.js'
import { renderEmail } from '../src/render.js'
import { SmtpEmailSender } from '../src/senders/smtp.js'

const SUPABASE_FILE = path.resolve(
  import.meta.dirname,
  '../../../docs/integrations/supabase-reset-password.html',
)

const reset = await renderEmail(EXAMPLES.resetPassword!)
writeFileSync(SUPABASE_FILE, reset.html)
console.log(
  `✓ Supabase reset-password design written to ${path.relative(process.cwd(), SUPABASE_FILE)}`,
)

if (!process.argv.includes('--no-send')) {
  // ALWAYS Mailpit here — even with a real Resend key in .env, the preview never emails anyone.
  const mailpit = new SmtpEmailSender(
    process.env.SMTP_HOST || 'localhost',
    Number(process.env.SMTP_PORT || 1025),
    'Nowoll <preview@nowoll.test>',
  )
  for (const [name, content] of Object.entries(EXAMPLES)) {
    const email = await renderEmail(content)
    const result = await mailpit.send({
      to: 'you@nowoll.test',
      subject: `[preview] ${email.subject}`,
      html: email.html,
      text: email.text,
      tag: email.tag,
    })
    if (!result.ok) {
      console.error(
        `✗ ${name}: ${result.reason}\n  Is Mailpit running? docker compose up -d mailpit`,
      )
      process.exit(1)
    }
    console.log(`✓ ${name.padEnd(18)} ${email.subject}`)
  }
  console.log('\nOpen http://localhost:8025 to see them.')
}
