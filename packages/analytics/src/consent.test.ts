import { describe, expect, it } from 'vitest'
import {
  ACCEPT_ALL,
  allowedTargets,
  CONSENT_VERSION,
  cookieDomains,
  hasAnyTracking,
  isWithdrawal,
  NO_TARGETS,
  ONLY_NECESSARY,
  parseConsent,
  serializeConsent,
  trackingCookiesToRemove,
} from './consent.js'

const ids = {
  ga4MeasurementId: 'G-AB12CD34EF',
  gtmContainerId: 'GTM-AB12CD3',
  metaPixelId: '123456789012345',
}

describe('saved consent', () => {
  it('round-trips the choice with its version and date', () => {
    const raw = serializeConsent(
      { analytics: true, marketing: false },
      new Date('2026-10-11T10:00:00Z'),
    )
    expect(JSON.parse(raw)).toEqual({
      v: CONSENT_VERSION,
      analytics: true,
      marketing: false,
      at: '2026-10-11T10:00:00.000Z',
    })
    expect(parseConsent(raw)).toEqual({ analytics: true, marketing: false })
  })

  it('no choice, an older version or a broken value → ask again (null)', () => {
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent('')).toBeNull()
    expect(parseConsent('not json')).toBeNull()
    expect(parseConsent('null')).toBeNull()
    expect(
      parseConsent(JSON.stringify({ v: CONSENT_VERSION - 1, analytics: true, marketing: true })),
    ).toBeNull()
    expect(
      parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: 'yes', marketing: true })),
    ).toBeNull()
  })
})

describe('which tools may load', () => {
  it('nothing before the customer chooses, or with "only necessary"', () => {
    expect(allowedTargets(null, ids)).toEqual(NO_TARGETS)
    expect(allowedTargets(ONLY_NECESSARY, ids)).toEqual(NO_TARGETS)
  })

  it('GA4 needs analytics, the Pixel needs marketing, GTM needs both', () => {
    expect(allowedTargets(ACCEPT_ALL, ids)).toEqual({ ga4: true, gtm: true, pixel: true })
    expect(allowedTargets({ analytics: true, marketing: false }, ids)).toEqual({
      ga4: true,
      gtm: false,
      pixel: false,
    })
    expect(allowedTargets({ analytics: false, marketing: true }, ids)).toEqual({
      ga4: false,
      gtm: false,
      pixel: true,
    })
  })

  it('a tool without an ID never loads, and no IDs means no banner', () => {
    const none = { ga4MeasurementId: '', gtmContainerId: '', metaPixelId: '' }
    expect(allowedTargets(ACCEPT_ALL, none)).toEqual(NO_TARGETS)
    expect(hasAnyTracking(none)).toBe(false)
    expect(hasAnyTracking({ ...none, metaPixelId: '1234567890' })).toBe(true)
    expect(allowedTargets(ACCEPT_ALL, { ...none, metaPixelId: '1234567890' })).toEqual({
      ga4: false,
      gtm: false,
      pixel: true,
    })
  })
})

describe('taking consent back', () => {
  it('is a withdrawal only when something allowed is now refused', () => {
    expect(isWithdrawal(ACCEPT_ALL, { analytics: true, marketing: false })).toBe(true)
    expect(isWithdrawal({ analytics: true, marketing: false }, ONLY_NECESSARY)).toBe(true)
    expect(isWithdrawal(null, ONLY_NECESSARY)).toBe(false)
    expect(isWithdrawal(ONLY_NECESSARY, ACCEPT_ALL)).toBe(false)
  })

  it('removes the refused tools’ cookies and keeps the shop’s own', () => {
    const names = [
      '_ga',
      '_ga_AB12CD34EF',
      '_gid',
      '_gcl_au',
      '_fbp',
      '_fbc',
      'nowoll-session',
      'sb-auth',
    ]
    expect(trackingCookiesToRemove(names, ONLY_NECESSARY)).toEqual([
      '_ga',
      '_ga_AB12CD34EF',
      '_gid',
      '_gcl_au',
      '_fbp',
      '_fbc',
    ])
    expect(trackingCookiesToRemove(names, { analytics: true, marketing: false })).toEqual([
      '_gcl_au',
      '_fbp',
      '_fbc',
    ])
    expect(trackingCookiesToRemove(names, { analytics: false, marketing: true })).toEqual([
      '_ga',
      '_ga_AB12CD34EF',
      '_gid',
      '_gcl_au',
    ])
    expect(trackingCookiesToRemove(names, ACCEPT_ALL)).toEqual([])
  })

  it('tries every domain a cookie may have been set on', () => {
    expect(cookieDomains('shop.nowoll.com')).toEqual(['shop.nowoll.com', 'nowoll.com'])
    expect(cookieDomains('nowoll.com')).toEqual(['nowoll.com'])
    expect(cookieDomains('localhost')).toEqual(['localhost'])
    expect(cookieDomains('127.0.0.1')).toEqual(['127.0.0.1'])
  })
})
