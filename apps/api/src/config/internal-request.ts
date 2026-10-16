import { timingSafeEqual } from 'node:crypto'

// ============================================================================
// Calls from the shop's OWN server (step 48).
//
// When the storefront builds a page, its server asks this API for the data —
// always from ONE address (the storefront container). The per-visitor rate
// limit (100/min) would count every page build of every visitor against that
// one address and start refusing during an ad spike, so pages would lose
// sections. Those calls carry a shared secret header instead, and skip the
// per-visitor limit (Nginx still limits each real visitor in front of the shop).
//
// INTERNAL_API_KEY lives only in the server's .env and the storefront's server
// environment — never NEXT_PUBLIC, never in a browser. Unset = nobody skips.
// ============================================================================
export const INTERNAL_KEY_HEADER = 'x-internal-key'

export function isInternalRequest(
  headers: Record<string, string | string[] | undefined>,
  key: string | undefined,
): boolean {
  const sent = headers[INTERNAL_KEY_HEADER]
  if (!key || typeof sent !== 'string') return false
  const a = Buffer.from(sent)
  const b = Buffer.from(key)
  // Constant-time comparison: the time taken never hints how much of a guess was right.
  return a.length === b.length && timingSafeEqual(a, b)
}
