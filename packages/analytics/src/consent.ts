// ============================================================================
// Customer consent (step 39a). Nothing that tracks people loads until the
// customer chooses (Bangladesh PDPO 2025: consent must be specific, freely
// given and withdrawable — docs/integrations/analytics.md). The choice lives
// in the customer's own browser; this file only reads, writes and interprets
// it, so it has no DOM code and is easy to test.
// ============================================================================

/** The two kinds of tracking a customer can allow. "Necessary" (bag, sign-in) needs no consent. */
export interface Consent {
  /** Google Analytics — counting visits and what people look at. */
  analytics: boolean
  /** Meta Pixel (and GTM) — measuring and improving ads. */
  marketing: boolean
}

export const CONSENT_STORAGE_KEY = 'nowoll-consent'

/**
 * Bump this when the list of tools or what they do changes — everyone is asked
 * again, because consent covers what the customer was told at the time.
 */
export const CONSENT_VERSION = 1

export const ACCEPT_ALL: Consent = { analytics: true, marketing: true }
export const ONLY_NECESSARY: Consent = { analytics: false, marketing: false }

/** What we save: the choice, the version it was given for, and when. */
export function serializeConsent(consent: Consent, now: Date): string {
  return JSON.stringify({
    v: CONSENT_VERSION,
    analytics: consent.analytics,
    marketing: consent.marketing,
    at: now.toISOString(),
  })
}

/** The saved choice, or null if there is none yet (or it was for an older version, or is broken). */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const o = v as Record<string, unknown>
    if (o.v !== CONSENT_VERSION) return null
    if (typeof o.analytics !== 'boolean' || typeof o.marketing !== 'boolean') return null
    return { analytics: o.analytics, marketing: o.marketing }
  } catch {
    return null
  }
}

/** The IDs typed into Admin → Settings → Marketing and tracking ('' = not used). */
export interface TrackingIds {
  ga4MeasurementId: string
  gtmContainerId: string
  metaPixelId: string
}

/** Which tools may load: only those with an ID AND the customer's consent. */
export interface TrackingTargets {
  ga4: boolean
  gtm: boolean
  pixel: boolean
}

export const NO_TARGETS: TrackingTargets = { ga4: false, gtm: false, pixel: false }

export function allowedTargets(consent: Consent | null, ids: TrackingIds): TrackingTargets {
  if (!consent) return NO_TARGETS
  return {
    ga4: consent.analytics && ids.ga4MeasurementId !== '',
    // GTM can load any tag a marketer adds, so it needs BOTH kinds of consent.
    gtm: consent.analytics && consent.marketing && ids.gtmContainerId !== '',
    pixel: consent.marketing && ids.metaPixelId !== '',
  }
}

/** Is there anything to ask about? (No IDs set → no banner at all.) */
export function hasAnyTracking(ids: TrackingIds): boolean {
  return ids.ga4MeasurementId !== '' || ids.gtmContainerId !== '' || ids.metaPixelId !== ''
}

/** Did the customer take back something they had allowed? (Then the page reloads without it.) */
export function isWithdrawal(before: Consent | null, after: Consent): boolean {
  return (!!before?.analytics && !after.analytics) || (!!before?.marketing && !after.marketing)
}

/**
 * Cookies the tools set on OUR domain, to remove when consent is taken back:
 * Google Analytics (_ga, _ga_<id>, _gid), Google Ads/GTM (_gcl_*), Meta (_fbp, _fbc).
 */
export function trackingCookiesToRemove(cookieNames: string[], consent: Consent): string[] {
  return cookieNames.filter((name) => {
    const google = name === '_gid' || name.startsWith('_ga') || name.startsWith('_gcl_')
    const meta = name === '_fbp' || name === '_fbc'
    return (
      (google && !consent.analytics) || ((meta || name.startsWith('_gcl_')) && !consent.marketing)
    )
  })
}

/**
 * The domains a cookie may have been set on, e.g. "shop.nowoll.com" →
 * ["shop.nowoll.com", "nowoll.com"] (Google Analytics uses the top one). A
 * cookie is only removed when deleted with the same domain it was set with.
 */
export function cookieDomains(hostname: string): string[] {
  if (hostname === 'localhost' || /^[\d.]+$/.test(hostname) || !hostname.includes('.'))
    return [hostname]
  const parts = hostname.split('.')
  const out: string[] = []
  for (let i = 0; i <= parts.length - 2; i++) out.push(parts.slice(i).join('.'))
  return out
}
