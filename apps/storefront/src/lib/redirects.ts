import { findRedirect, type RedirectRule } from '@nowoll/validation'
import { publicEnv } from '@/lib/env'

// ============================================================================
// Redirects for the shop (step 43c): old web address → new one. The rules come
// from the API (Admin → Content → Redirects, plus automatic ones when an
// address changes) and are kept for up to a minute, so a page view never
// waits on the API more than once a minute. If the API can't be reached, the
// last rules are kept (or none) — a redirect problem never breaks the shop.
// ============================================================================

const TTL_MS = 60_000
let cache: { rules: RedirectRule[]; at: number } | null = null

/** For tests. */
export const resetRedirectCache = () => {
  cache = null
}

export async function redirectRules(
  now = Date.now(),
  load: () => Promise<RedirectRule[] | null> = loadRules,
): Promise<RedirectRule[]> {
  if (cache && now - cache.at < TTL_MS) return cache.rules
  const fresh = await load().catch(() => null)
  cache = { rules: fresh ?? cache?.rules ?? [], at: now }
  return cache.rules
}

async function loadRules(): Promise<RedirectRule[] | null> {
  const res = await fetch(`${publicEnv.apiUrl}/api/v1/redirects`, {
    signal: AbortSignal.timeout(2000),
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  const body = (await res.json()) as { success?: boolean; data?: RedirectRule[] }
  return Array.isArray(body.data) ? body.data : null
}

/** Where (if anywhere) this request should go instead. */
export async function redirectFor(pathname: string, search: string) {
  return findRedirect(await redirectRules(), pathname, search)
}
