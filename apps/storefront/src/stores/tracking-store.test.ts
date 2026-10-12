import {
  ACCEPT_ALL,
  addToCartEvent,
  CONSENT_STORAGE_KEY,
  ONLY_NECESSARY,
  serializeConsent,
  type TrackingWindow,
} from '@nowoll/analytics'
import { page, track, useTrackingStore } from './tracking-store'

const IDS = {
  ga4MeasurementId: 'G-AB12CD34EF',
  gtmContainerId: '',
  metaPixelId: '123456789012345',
}
const NO_IDS = { ga4MeasurementId: '', gtmContainerId: '', metaPixelId: '' }
const initial = useTrackingStore.getState()
const w = window as unknown as TrackingWindow

const event = () =>
  addToCartEvent(
    {
      productId: 'p1',
      sku: 'NW-OXF-M',
      name: 'Oxford',
      variant: 'M / Blue',
      price: 1490,
      quantity: 1,
    },
    'evt-1',
  )

/** What GA4's gtag() and Meta's fbq() have queued (as plain arrays). */
const gtagCalls = () => (w.dataLayer ?? []).map((a) => [...(a as IArguments)])
const fbqCalls = () => (w.fbq?.queue ?? []).map((a) => [...(a as IArguments)])

beforeEach(() => {
  useTrackingStore.setState(initial, true)
  delete w.dataLayer
  delete w.gtag
  delete w.fbq
  delete w._fbq
  localStorage.clear()
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]!.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
})

describe('tracking store (step 39a)', () => {
  it('events wait until the customer chooses; "Accept all" starts the tools and sends them', () => {
    track(event()) // the product page can fire before the layout starts us
    useTrackingStore.getState().start(IDS)
    track(event())
    expect(w.gtag).toBeUndefined()
    expect(w.fbq).toBeUndefined()
    expect(useTrackingStore.getState().waiting).toHaveLength(2)

    useTrackingStore.getState().choose(ACCEPT_ALL)

    expect(gtagCalls()).toContainEqual(['config', 'G-AB12CD34EF'])
    expect(gtagCalls().filter((c) => c[0] === 'event')).toHaveLength(2)
    expect(fbqCalls()).toContainEqual(['init', '123456789012345'])
    expect(fbqCalls()).toContainEqual([
      'track',
      'AddToCart',
      expect.objectContaining({ content_ids: ['NW-OXF-M'] }),
      { eventID: 'evt-1' },
    ])
    expect(useTrackingStore.getState().waiting).toEqual([])
    // the choice is remembered
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toMatchObject(ACCEPT_ALL)

    track(event()) // later events go straight out
    expect(gtagCalls().filter((c) => c[0] === 'event')).toHaveLength(3)
  })

  it('"Only necessary": nothing loads, the waiting events are dropped, later ones go nowhere', () => {
    useTrackingStore.getState().start(IDS)
    track(event())
    useTrackingStore.getState().choose(ONLY_NECESSARY)
    track(event())
    expect(w.gtag).toBeUndefined()
    expect(w.fbq).toBeUndefined()
    expect(w.dataLayer).toBeUndefined()
    expect(useTrackingStore.getState().waiting).toEqual([])
  })

  it('analytics only → Google Analytics, but not the Pixel', () => {
    useTrackingStore.getState().start(IDS)
    useTrackingStore.getState().choose({ analytics: true, marketing: false })
    track(event())
    expect(gtagCalls().some((c) => c[1] === 'add_to_cart')).toBe(true)
    expect(w.fbq).toBeUndefined()
  })

  it('a choice saved earlier is used straight away (no banner, tools start)', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    useTrackingStore.getState().start(IDS)
    expect(useTrackingStore.getState().consent).toEqual(ACCEPT_ALL)
    expect(useTrackingStore.getState().targets).toEqual({ ga4: true, gtm: false, pixel: true })
  })

  it('no IDs set → nothing to ask, events are dropped, nothing loads', () => {
    track(event())
    useTrackingStore.getState().start(NO_IDS)
    track(event())
    expect(useTrackingStore.getState().waiting).toEqual([])
    expect(w.dataLayer).toBeUndefined()
  })

  it('a tool starts only once, even if started again (React runs effects twice in development)', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    useTrackingStore.getState().start(IDS)
    useTrackingStore.getState().start(IDS)
    expect(gtagCalls().filter((c) => c[0] === 'config')).toHaveLength(1)
    expect(fbqCalls().filter((c) => c[0] === 'init')).toHaveLength(1)
  })

  it('taking consent back removes the tools’ cookies and reloads without them', () => {
    const reload = vi.spyOn(page, 'reload').mockImplementation(() => {})
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    useTrackingStore.getState().start(IDS)
    document.cookie = '_ga=GA1.1.123; path=/'
    document.cookie = '_fbp=fb.1.123.456; path=/'
    document.cookie = 'keep-me=1; path=/'

    useTrackingStore.getState().choose({ analytics: true, marketing: false })

    expect(reload).toHaveBeenCalledOnce()
    expect(document.cookie).toContain('_ga=')
    expect(document.cookie).not.toContain('_fbp=')
    expect(document.cookie).toContain('keep-me=1')
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toMatchObject({
      analytics: true,
      marketing: false,
    })
    reload.mockRestore()
  })

  it('blocked storage (private mode) → asks again, never crashes', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    useTrackingStore.getState().start(IDS)
    expect(useTrackingStore.getState().consent).toBeNull()
    useTrackingStore.getState().choose(ACCEPT_ALL)
    expect(useTrackingStore.getState().targets.ga4).toBe(true)
    get.mockRestore()
    set.mockRestore()
  })
})

describe('order request: Meta details only with Marketing consent (step 39b)', () => {
  it('Marketing allowed + Pixel in use → consent and the Meta cookies', async () => {
    const { orderTrackingPart } = await import('./tracking-store')
    document.cookie = '_fbp=fb.1.1760000000000.1234567890; path=/'
    document.cookie = '_fbc=fb.1.1760000000000.IwAR_x; path=/'
    useTrackingStore.getState().start(IDS)
    expect(orderTrackingPart()).toBeUndefined() // not chosen yet
    useTrackingStore.getState().choose(ACCEPT_ALL)
    expect(orderTrackingPart()).toEqual({
      marketing: true,
      fbp: 'fb.1.1760000000000.1234567890',
      fbc: 'fb.1.1760000000000.IwAR_x',
    })
  })

  it('analytics only, only necessary, or no Pixel → nothing at all', async () => {
    const { orderTrackingPart } = await import('./tracking-store')
    useTrackingStore.getState().start(IDS)
    useTrackingStore.getState().choose({ analytics: true, marketing: false })
    expect(orderTrackingPart()).toBeUndefined()

    useTrackingStore.setState(initial, true)
    localStorage.clear()
    useTrackingStore.getState().start({ ...IDS, metaPixelId: '' })
    useTrackingStore.getState().choose(ACCEPT_ALL)
    expect(orderTrackingPart()).toBeUndefined()
  })
})
