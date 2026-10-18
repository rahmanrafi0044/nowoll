// ============================================================================
// The shop's Content-Security-Policy — security audit (step 53, OWASP A05;
// docs/security-audit.md). Sent on every page by next.config.ts.
//
// A CSP tells the browser where this site may load scripts, images and data
// from, and where it may send data. If an attacker manages to slip a <script
// src="https://evil…"> into a page, the browser refuses to run it.
//
// WITHOUT NONCES, on purpose (Rafi's decision, option A): the Next.js 16 docs
// say a nonce-based CSP forces every page to be built per visitor — no
// pre-built pages, no 60-second cache (ISR) — which costs speed during ad
// spikes. So inline scripts are allowed ('unsafe-inline'), and everything else
// is locked to the sites below. Google's own CSP guide lists 'unsafe-inline'
// as the fallback for gtag without nonces.
//
// The outside sites (only what the shop really uses):
//   Google Analytics 4 (gtag / Tag Manager) — Google's CSP guide, "Analytics
//     without Ads features": scripts and images from www.googletagmanager.com,
//     images and data to *.google-analytics.com, data to *.google.com
//   Meta Pixel — connect.facebook.net (script), www.facebook.com (beacons).
//     Meta publishes no CSP list; these hosts are checked by a browser test.
//   The API and Supabase (photos, password reset) — from the build's settings.
// Both trackers load only after cookie consent (step 39a); the CSP only says
// where they may come from, never that they load.
// ============================================================================

const GOOGLE_SCRIPT = 'https://www.googletagmanager.com'
const GOOGLE_DATA = ['https://*.google-analytics.com', 'https://*.google.com']
const META_SCRIPT = 'https://connect.facebook.net'
const META_BEACON = 'https://www.facebook.com'

const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

export function buildCsp(opts: { apiUrl?: string; supabaseUrl?: string; dev: boolean }): string {
  const api = origin(opts.apiUrl)
  const supabase = origin(opts.supabaseUrl)
  const list = (...items: (string | null | false)[]) => items.filter(Boolean).join(' ')
  const directives: Record<string, string> = {
    'default-src': "'self'",
    // 'unsafe-eval' only for the dev server (React's dev tools need it).
    'script-src': list(
      "'self'",
      "'unsafe-inline'",
      opts.dev && "'unsafe-eval'",
      GOOGLE_SCRIPT,
      META_SCRIPT,
    ),
    // Inline <style> (the admin-chosen brand colour, lib/theme.ts) and style=""
    // attributes (colour swatches) are needed.
    'style-src': "'self' 'unsafe-inline'",
    'img-src': list(
      "'self'",
      'data:',
      'blob:',
      supabase,
      GOOGLE_SCRIPT,
      ...GOOGLE_DATA,
      META_BEACON,
    ),
    'font-src': "'self' data:",
    'connect-src': list(
      "'self'",
      api,
      supabase,
      GOOGLE_SCRIPT,
      ...GOOGLE_DATA,
      META_BEACON,
      META_SCRIPT,
    ),
    'frame-src': GOOGLE_SCRIPT, // Tag Manager's preview/debug frame
    'frame-ancestors': "'none'", // no other site may put the shop in a frame (clickjacking)
    'object-src': "'none'", // no plugins (Flash and the like)
    'base-uri': "'self'", // no <base> tag sending relative links elsewhere
    'form-action': "'self'", // forms post only to the shop itself
  }
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ')
}
