// ============================================================================
// The browser side (step 39a): the official start-up code of each tool,
// written here as code instead of pasted inline <script> snippets, plus the
// one function that sends an event to every tool that may run. The window is
// passed in (not taken from the global), so tests can use a plain object.
//
// Why not paste the snippets: inline scripts need a looser Content-Security-
// Policy and are exactly what CLAUDE.md Rule 9 keeps out. The logic below is
// the same as the official snippets (docs/integrations/analytics.md, meta.md);
// the shop then loads each tool's own script file from its official address.
// ============================================================================

import type { TrackingTargets } from './consent.js'
import type { TrackEvent } from './events.js'

type Fn = (...args: unknown[]) => void

/** Meta's fbq(): a function with its queue attached (fbevents.js sets callMethod when it loads). */
export type Fbq = Fn & {
  callMethod?: Fn
  queue?: unknown[]
  push?: unknown
  loaded?: boolean
  version?: string
}

/** The parts of `window` the tools use. */
export interface TrackingWindow {
  dataLayer?: unknown[]
  gtag?: Fn
  fbq?: Fbq
  _fbq?: unknown
}

export const ga4ScriptUrl = (id: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
export const gtmScriptUrl = (id: string) =>
  `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`
export const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js'

/** GA4: the official gtag() queue + config. Calls wait in dataLayer until gtag.js loads. */
export function installGa4(win: TrackingWindow, measurementId: string): void {
  win.dataLayer = win.dataLayer ?? []
  if (!win.gtag) {
    const layer = win.dataLayer
    // gtag.js reads the real `arguments` object, not an array — as in Google's snippet.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      layer.push(arguments)
    }
    win.gtag('js', new Date())
  }
  win.gtag('config', measurementId)
}

/** GTM: the official start marker. gtm.js then reads everything in dataLayer. */
export function installGtm(win: TrackingWindow, now: number): void {
  win.dataLayer = win.dataLayer ?? []
  win.dataLayer.push({ 'gtm.start': now, event: 'gtm.js' })
}

/** Meta Pixel: the official fbq() queue, then init + the first PageView. */
export function installPixel(win: TrackingWindow, pixelId: string): void {
  if (!win.fbq) {
    // Like Meta's snippet: queue the real `arguments` until fbevents.js takes over (callMethod).
    const fbq: Fbq = function () {
      /* eslint-disable prefer-rest-params */
      if (fbq.callMethod) fbq.callMethod(...arguments)
      else fbq.queue?.push(arguments)
      /* eslint-enable prefer-rest-params */
    }
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    win.fbq = fbq
    if (!win._fbq) win._fbq = fbq
  }
  win.fbq('init', pixelId)
  win.fbq('track', 'PageView')
}

/** Meta counts page views itself only on full loads; the shop changes pages without one. */
export function trackPageView(win: TrackingWindow, targets: TrackingTargets): void {
  if (targets.pixel && win.fbq) win.fbq('track', 'PageView')
}

/** Send one shopping event to every tool that is allowed and loaded. */
export function sendEvent(win: TrackingWindow, targets: TrackingTargets, event: TrackEvent): void {
  if (targets.ga4 && win.gtag) win.gtag('event', event.ga4.name, event.ga4.params)
  if (targets.gtm && win.dataLayer) {
    // Google's advice: clear the previous ecommerce object first, so old items don't mix in.
    win.dataLayer.push({ ecommerce: null })
    win.dataLayer.push({ event: event.ga4.name, ecommerce: event.ga4.params })
  }
  if (targets.pixel && win.fbq)
    win.fbq('track', event.meta.name, event.meta.data, { eventID: event.meta.eventId })
}
