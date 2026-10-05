import type { ApiResult } from '@nowoll/types'
import { publicEnv } from '@/lib/env'

// How long a cached API response may be reused before Next.js fetches it
// again in the background. Matches the spec's "ISR (60s)": a product added
// in the admin panel appears on the storefront within about a minute.
export const REVALIDATE_SECONDS = 60

/**
 * Server-side GET from the Nowoll API. Returns the `data`, or null when:
 *   • the API answers 404 (e.g. the hero block is switched off) — normal, silent
 *   • the API is down or returns an error — logged
 * Pages treat null as "hide this section", so one failing API call (or an
 * API that's unreachable during `next build`) never breaks the whole page.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const url = `${publicEnv.apiUrl}/api/v1${path}`
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } })
    if (res.status === 404) return null
    const body = (await res.json()) as ApiResult<T>
    if (!res.ok || !body.success) {
      console.error(`API ${res.status} for GET ${path}: ${body.success ? '' : body.message}`)
      return null
    }
    return body.data
  } catch (error) {
    console.error(`API unreachable for GET ${path}: ${String(error)}`)
    return null
  }
}
