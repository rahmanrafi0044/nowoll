import './jitless.js' // first: Zod's no-eval switch (see jitless.ts)
import * as z from 'zod'

// ============================================================================
// Redirects (step 43c): an old web address on the shop → its new one. Only
// addresses on THIS shop (never another website — an "open redirect" is how
// phishing links get disguised). Addresses are compared cleaned: lowercase,
// no trailing slash, no ?query or #part.
// ============================================================================

/**
 * Never redirected: the home page and the shop's working parts. (A redirect
 * from /checkout would break buying; /admin and /api aren't the shop's pages.)
 */
export const PROTECTED_PATHS = [
  '/account',
  '/admin',
  '/api',
  '/cart',
  '/checkout',
  '/forgot-password',
  '/login',
  '/newsletter',
  '/orders',
  '/register',
  '/reset-password',
  '/robots.txt',
  '/sitemap.xml',
  '/_next',
] as const

/** "/Shop/Eid/?a=1#x" → "/shop/eid"; anything that isn't a path on this shop → null. */
export function cleanPath(input: string): string | null {
  let p = input.trim()
  if (!p.startsWith('/') || p.startsWith('//')) return null
  p = p.split(/[?#]/)[0]!
  try {
    p = decodeURI(p)
  } catch {
    return null
  }
  p = p.toLowerCase().replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  // Letters (any language), digits and - _ . / only — no spaces, no tricks.
  if (!/^\/[\p{L}\p{N}\-_./]*$/u.test(p) || p.split('/').some((s) => s === '..' || s === '.'))
    return null
  return p
}

/** Is this (cleaned) address the home page or one of the shop's working parts? */
export const isProtectedPath = (p: string) =>
  p === '/' || PROTECTED_PATHS.some((x) => p === x || p.startsWith(`${x}/`))

const fromPath = z
  .string()
  .max(300, 'At most 300 letters')
  .transform((v, ctx) => {
    const p = cleanPath(v)
    if (!p) {
      ctx.addIssue({
        code: 'custom',
        message: 'Start with / — an address on this shop, e.g. /old-sale',
      })
      return z.NEVER
    }
    if (isProtectedPath(p)) {
      ctx.addIssue({
        code: 'custom',
        message: 'The home page, checkout, cart, account, login, admin and api can’t be redirected',
      })
      return z.NEVER
    }
    return p
  })

/** The new address: a path on this shop (a ?query is kept, e.g. /shop?sort=newest). */
const toPath = z
  .string()
  .trim()
  .max(300, 'At most 300 letters')
  .refine(
    (v) => v.startsWith('/') && !v.startsWith('//') && !/[\s\\]/.test(v) && cleanPath(v) !== null,
    'An address on this shop, starting with / (other websites aren’t allowed)',
  )

export const redirectInputSchema = z
  .object({
    fromPath,
    toPath,
    /** 301 (moved for good — Google updates its results) or 302 (for now). */
    permanent: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((r) => cleanPath(r.toPath) !== r.fromPath, {
    path: ['toPath'],
    message: 'An address can’t send visitors to itself',
  })
export type RedirectInput = z.output<typeof redirectInputSchema>

/** One rule as the shop's proxy receives it. */
export interface RedirectRule {
  from: string
  to: string
  permanent: boolean
}

/**
 * Where should this request go? The path is cleaned the same way the rules
 * were; the visitor's ?query is carried over unless the target has its own.
 */
export function findRedirect(
  rules: readonly RedirectRule[],
  pathname: string,
  search = '',
): { location: string; permanent: boolean } | null {
  const p = cleanPath(pathname)
  if (!p || isProtectedPath(p)) return null
  const rule = rules.find((r) => r.from === p)
  if (!rule) return null
  const location = rule.to.includes('?') || !search ? rule.to : `${rule.to}${search}`
  return { location, permanent: rule.permanent }
}
