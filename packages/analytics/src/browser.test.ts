import { describe, expect, it, vi } from 'vitest'
import {
  ga4ScriptUrl,
  gtmScriptUrl,
  installGa4,
  installGtm,
  installPixel,
  sendEvent,
  trackPageView,
  type TrackingWindow,
} from './browser.js'
import { NO_TARGETS } from './consent.js'
import { addToCartEvent } from './events.js'

const event = addToCartEvent(
  { productId: 'p1', sku: 'SKU-1', name: 'Shirt', variant: 'M', price: 100, quantity: 1 },
  'e1',
)
const all = { ga4: true, gtm: true, pixel: true }

describe('start-up code (same as the official snippets)', () => {
  it('GA4: gtag() queues the real arguments objects in dataLayer, then config', () => {
    const win: TrackingWindow = {}
    installGa4(win, 'G-AB12CD34EF')
    expect(win.dataLayer).toHaveLength(2)
    const [js, config] = win.dataLayer as IArguments[]
    expect(Object.prototype.toString.call(js)).toBe('[object Arguments]')
    expect(js![0]).toBe('js')
    expect([...config!]).toEqual(['config', 'G-AB12CD34EF'])
  })

  it('GTM: pushes the start marker', () => {
    const win: TrackingWindow = { dataLayer: ['earlier'] }
    installGtm(win, 1_700_000_000_000)
    expect(win.dataLayer).toEqual(['earlier', { 'gtm.start': 1_700_000_000_000, event: 'gtm.js' }])
  })

  it('Pixel: fbq() queues calls until fbevents.js loads, then hands them over', () => {
    const win: TrackingWindow = {}
    installPixel(win, '123456789012345')
    expect(win.fbq!.queue!.map((a) => [...(a as IArguments)])).toEqual([
      ['init', '123456789012345'],
      ['track', 'PageView'],
    ])
    expect(win._fbq).toBe(win.fbq)
    // fbevents.js sets callMethod when it loads; calls then go straight to it.
    const callMethod = vi.fn()
    win.fbq!.callMethod = callMethod
    win.fbq!('track', 'PageView')
    expect(callMethod).toHaveBeenCalledWith('track', 'PageView')
  })

  it('script addresses are the official ones (IDs escaped)', () => {
    expect(ga4ScriptUrl('G-AB12')).toBe('https://www.googletagmanager.com/gtag/js?id=G-AB12')
    expect(gtmScriptUrl('GTM-AB1&x')).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-AB1%26x')
  })
})

describe('sending an event', () => {
  const tools = () => ({ gtag: vi.fn(), fbq: vi.fn(), dataLayer: [] as unknown[] })

  it('goes to every allowed tool in its own format, with the Meta event id as 4th argument', () => {
    const win = tools()
    sendEvent(win, all, event)
    expect(win.gtag).toHaveBeenCalledWith('event', 'add_to_cart', event.ga4.params)
    expect(win.dataLayer).toEqual([
      { ecommerce: null },
      { event: 'add_to_cart', ecommerce: event.ga4.params },
    ])
    expect(win.fbq).toHaveBeenCalledWith('track', 'AddToCart', event.meta.data, { eventID: 'e1' })
  })

  it('never to a tool the customer refused (even if it is on the page)', () => {
    const win = tools()
    sendEvent(win, NO_TARGETS, event)
    trackPageView(win, NO_TARGETS)
    expect(win.gtag).not.toHaveBeenCalled()
    expect(win.fbq).not.toHaveBeenCalled()
    expect(win.dataLayer).toEqual([])
  })

  it('GA4 without GTM: no dataLayer ecommerce pushes (they would be counted by nobody, or twice)', () => {
    const win = tools()
    sendEvent(win, { ga4: true, gtm: false, pixel: false }, event)
    expect(win.gtag).toHaveBeenCalledOnce()
    expect(win.dataLayer).toEqual([])
  })

  it('page views go to the Pixel only', () => {
    const win = tools()
    trackPageView(win, all)
    expect(win.fbq).toHaveBeenCalledWith('track', 'PageView')
    expect(win.gtag).not.toHaveBeenCalled()
  })
})
