// ============================================================================
// pnpm launch-check -- --url https://nowoll.com [--auth user:password]
//
// The launch check (step 54, docs/launch-checklist.md): checks the LIVE site
// from outside — DNS + HTTPS for every address, HTTPS-only, the trial password
// off, security headers, online payment LIVE (not sandbox), contact details,
// published policies, no demo content, sitemap / robots / structured data.
// It only reads (GET requests): safe on production at any time.
//
// --auth: while the trial password is on, pass it so the other checks can get
// in (the "trial password OFF" check still fails, on purpose, until it's off).
// Ends with exit code 1 when anything fails — run it right before the ads start.
// ============================================================================
/* eslint-disable no-console -- command-line script: it reports by printing */
import { runChecks } from './launch-check/checks.js'

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<number> {
  const url = option('url')
  if (!url) {
    console.error('Usage: pnpm launch-check -- --url https://nowoll.com [--auth user:password]')
    return 2
  }
  const domain = new URL(url).hostname
  const auth = option('auth')
  const results = await runChecks({
    domain,
    headers: auth ? { Authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {},
  })

  const mark = { pass: '✅', fail: '❌', warn: '⚠️ ' } as const
  console.log(`\nLaunch check — ${domain}\n`)
  for (const section of [...new Set(results.map((r) => r.section))]) {
    console.log(`\n${section}`)
    for (const r of results.filter((x) => x.section === section))
      console.log(`  ${mark[r.status]} ${r.item}\n       ${r.detail}`)
  }
  const count = (s: string) => results.filter((r) => r.status === s).length
  console.log(`\n${count('pass')} passed, ${count('fail')} failed, ${count('warn')} warnings`)
  console.log(
    'Not checked here (see docs/launch-checklist.md): real payments, emails, the database,\n' +
      'Sentry, UptimeRobot, Lighthouse (pnpm lighthouse) and Google’s Rich Results Test.',
  )
  const locked = results.find((r) => r.item.startsWith('trial password'))?.status === 'fail'
  if (locked && !auth)
    console.log(
      '\nThe shop asks for the trial password: add --auth user:password to check the rest.',
    )
  return count('fail') > 0 ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
