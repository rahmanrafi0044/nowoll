// ============================================================================
// pnpm --filter @nowoll/payments sandbox-check
//
// Proves the SSLCommerz SANDBOX connection works by creating ONE ৳10 test
// payment session (sandbox = fake money; nothing is charged). Refuses to run
// with live credentials. It only creates a session — it doesn't pay it.
// ============================================================================
import { randomUUID } from 'node:crypto'
import { isSslCommerzConfigured, SslCommerzAdapter } from '../src/index.js'

const config = {
  storeId: process.env.SSLCOMMERZ_STORE_ID ?? '',
  storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD ?? '',
  isLive: process.env.SSLCOMMERZ_IS_LIVE === 'true',
}

if (config.isLive) {
  console.error(
    '✗ SSLCOMMERZ_IS_LIVE=true — this check only runs against the SANDBOX. Nothing was sent.',
  )
  process.exit(1)
}
if (!isSslCommerzConfigured(config)) {
  console.error('✗ SSLCommerz sandbox credentials are not set in the root .env.')
  console.error('  Register (free) at https://developer.sslcommerz.com/registration/ and fill in')
  console.error('  SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD.')
  process.exit(1)
}

const transactionId = `CHECK-${randomUUID().slice(0, 20)}`
const result = await new SslCommerzAdapter(config).createPayment({
  transactionId,
  amount: '10',
  customer: {
    name: 'Sandbox Check',
    email: 'sandbox-check@example.com',
    phone: '+8801700000000',
    address: 'Test address',
    city: 'Dhaka',
  },
  shipping: { name: 'Sandbox Check', address: 'Test address', city: 'Dhaka' },
  productNames: ['Connection check'],
  itemCount: 1,
  urls: {
    success: 'https://example.com/success',
    fail: 'https://example.com/fail',
    cancel: 'https://example.com/cancel',
    ipn: 'https://example.com/ipn',
  },
})

if (!result.ok) {
  console.error(`✗ SSLCommerz sandbox said no: ${result.reason} — ${result.message}`)
  process.exit(1)
}
console.log(`✓ Sandbox session created for ৳10 (tran_id ${transactionId})`)
console.log(`  Payment page host: ${new URL(result.redirectUrl!).host}`)
console.log('  Nothing was charged — this was the sandbox, and the session was never paid.')
