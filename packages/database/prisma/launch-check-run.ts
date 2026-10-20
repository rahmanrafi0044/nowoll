// Database tasks → launch-check: prints the database half of the launch check
// (prisma/launch-check.ts). Read-only. Exit code 1 when anything fails.
/* eslint-disable no-console -- command-line script: it reports by printing */
import { createPrismaClient } from '../src/client'
import { gatherFacts, judge } from './launch-check'

async function main() {
  const db = createPrismaClient()
  try {
    const checks = judge(await gatherFacts(db))
    const mark = { pass: '✅', fail: '❌', warn: '⚠️ ' } as const
    console.log('\nLaunch check — database\n')
    for (const c of checks) console.log(`  ${mark[c.status]} ${c.item}\n       ${c.detail}`)
    const failed = checks.filter((c) => c.status === 'fail').length
    console.log(`\n${checks.length - failed} passed, ${failed} failed`)
    return failed > 0 ? 1 : 0
  } finally {
    await db.$disconnect()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
