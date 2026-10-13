import { createHmac, timingSafeEqual } from 'node:crypto'

// ============================================================================
// Webhook signatures as Resend sends them (Svix — docs/integrations/resend.md):
//   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
//   HMAC-SHA256, key = base64-decoded part of the secret after "whsec_"
//   svix-signature = space-separated "v1,<base64>" — any one matching is valid
// Constant-time comparison; the timestamp must be within 5 minutes (either
// way), so a captured request can't be replayed later.
// ============================================================================

export const TOLERANCE_SECONDS = 5 * 60

export function verifySvixSignature(input: {
  id: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  rawBody: Buffer | undefined
  secret: string
  now: Date
}): boolean {
  const { id, timestamp, signature, rawBody, secret } = input
  if (!id || !timestamp || !signature || !rawBody) return false
  if (!/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(input.now.getTime() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest()
  return signature
    .split(' ')
    .map((part) => part.split(','))
    .filter(([version]) => version === 'v1')
    .some(([, sig]) => {
      const given = Buffer.from(sig ?? '', 'base64')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
}
