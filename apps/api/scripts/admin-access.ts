// ============================================================================
// Who may use the admin panel (step 29a). Run from the repo root:
//
//   pnpm admin:grant <email> [ADMIN|STAFF]   make an account staff (default ADMIN)
//   pnpm admin:revoke <email>                back to a normal customer account
//   pnpm admin:reset-2fa <email>             lost phone: remove the authenticator
//                                            app, so the next sign-in sets up a new one
//
// The account must already exist: sign up on the shop first (same email).
// Changes apply on the person's very next click — the API reads the role from
// the database on every admin request.
//
// Production: run on the server with the production .env — this is the ONLY
// supported way to give someone admin access (no editing the database by hand).
// ============================================================================
/* eslint-disable no-console -- this is a command-line script; printing is its job */
import { createPrismaClient } from '@nowoll/database'
import { SupabaseAuthProvider } from '../src/auth/supabase-auth-provider.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (root .env).`)
  return value
}

const USAGE = `Usage:
  pnpm admin:grant <email> [ADMIN|STAFF]
  pnpm admin:revoke <email>
  pnpm admin:reset-2fa <email>`

const [command, rawEmail, rawRole = 'ADMIN'] = process.argv.slice(2)
const email = rawEmail?.trim().toLowerCase()
const role = rawRole.toUpperCase()
if (!command || !email || !['grant', 'revoke', 'reset-2fa'].includes(command)) {
  console.error(USAGE)
  process.exit(1)
}
if (command === 'grant' && role !== 'ADMIN' && role !== 'STAFF') {
  console.error(`✗ Role must be ADMIN or STAFF (got "${rawRole}").`)
  process.exit(1)
}

const prisma = createPrismaClient(requireEnv('DATABASE_URL'))
try {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.deletedAt) {
    console.error(`✗ No account for ${email}. Sign up on the shop with this email first.`)
    process.exitCode = 1
  } else if (command === 'grant') {
    const toRole = role as 'ADMIN' | 'STAFF'
    // The staff change log (step 38e): actor null = "a server command".
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: toRole } }),
      prisma.staffChange.create({
        data: {
          targetId: user.id,
          action: user.role === 'CUSTOMER' ? 'GRANTED' : 'ROLE_CHANGED',
          fromRole: user.role,
          toRole,
        },
      }),
    ])
    console.log(`✓ ${email} is now ${role}.`)
    console.log(
      '  Next: sign in at the admin panel and scan the QR code with an authenticator app.',
    )
    if (user.status === 'BANNED')
      console.log('  ⚠ This account is BANNED — it still cannot sign in.')
  } else if (command === 'revoke') {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: 'CUSTOMER' } }),
      prisma.staffChange.create({
        data: { targetId: user.id, action: 'REVOKED', fromRole: user.role, toRole: 'CUSTOMER' },
      }),
    ])
    console.log(`✓ ${email} no longer has admin access (was ${user.role}).`)
  } else {
    const auth = new SupabaseAuthProvider(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )
    if (await auth.removeTotp(user.id)) {
      await prisma.staffChange.create({ data: { targetId: user.id, action: 'TWO_FACTOR_RESET' } })
      console.log(`✓ Authenticator app removed for ${email}; they were signed out everywhere.`)
      console.log('  Their next admin sign-in shows a new QR code to scan.')
    } else {
      console.error('✗ Supabase didn’t accept the request — see the error above, then try again.')
      process.exitCode = 1
    }
  }
} finally {
  await prisma.$disconnect()
}
