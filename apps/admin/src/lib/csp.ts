// Content-Security-Policy: tells the browser exactly which scripts, styles and
// connections this site may use. If an attacker manages to inject a <script>
// into an admin page (XSS), the browser refuses to run it, because it doesn't
// carry this request's secret nonce.
//
// Follows the Next.js 16 CSP guide (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
export function buildCsp({
  nonce,
  isDev,
  connectSrc,
}: {
  nonce: string
  isDev: boolean
  connectSrc: string[] // our API — the only server the browser talks to
}): string {
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets nonce-approved scripts load the chunks they need.
    // 'unsafe-eval' only in development — React uses eval for better error stacks there.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:${connectSrc.map((o) => ` ${o}`).join('')}`,
    `font-src 'self'`,
    `connect-src 'self'${connectSrc.map((o) => ` ${o}`).join('')}${isDev ? ' ws:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`, // the admin panel can never be embedded in another site
  ]
  if (!isDev) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}
