import {
  ACCEPT_ALL,
  CONSENT_STORAGE_KEY,
  serializeConsent,
  type TrackingWindow,
} from '@nowoll/analytics'
import type { OrderReceiptView } from '@nowoll/types'
import { useTrackingStore } from '@/stores/tracking-store'
import { trackPurchaseOnce } from './tracking'

const initial = useTrackingStore.getState()
const w = window as unknown as TrackingWindow
const NOW = new Date('2026-10-11T12:00:00Z').getTime()

const receipt = (over: Partial<OrderReceiptView> = {}) =>
  ({
    orderId: 'o1',
    displayNumber: 'NW-10001',
    placedAt: '2026-10-11T11:00:00Z',
    status: 'PENDING',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    items: [
      {
        productId: 'p1',
        productName: 'Oxford Shirt',
        variantLabel: 'M / Blue',
        sku: 'NW-OXF-M-BLU',
        imageUrl: null,
        unitPrice: '1490.00',
        quantity: 2,
        lineTotal: '2980.00',
      },
    ],
    total: '3060.00',
    totals: {
      subtotal: '2980.00',
      discount: '0.00',
      discountCode: null,
      shippingFee: '80.00',
      vatRate: '0',
      vatAmount: '0.00',
      total: '3060.00',
    },
    ...over,
  }) as OrderReceiptView

const purchases = () =>
  (w.fbq?.queue ?? []).map((a) => [...(a as IArguments)]).filter((c) => c[1] === 'Purchase')

beforeEach(() => {
  useTrackingStore.setState(initial, true)
  delete w.dataLayer
  delete w.gtag
  delete w.fbq
  delete w._fbq
  localStorage.clear()
  localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
  useTrackingStore.getState().start({
    ga4MeasurementId: 'G-AB12CD34EF',
    gtmContainerId: '',
    metaPixelId: '123456789012',
  })
})

describe('purchase reported once (step 39a)', () => {
  it('sends the order with SKUs, total, delivery and the server-rebuildable event ID', () => {
    trackPurchaseOnce(receipt(), NOW)
    expect(purchases()).toEqual([
      [
        'track',
        'Purchase',
        expect.objectContaining({
          content_ids: ['NW-OXF-M-BLU'],
          order_id: 'NW-10001',
          value: 3060,
          currency: 'BDT',
        }),
        { eventID: 'purchase-NW-10001' },
      ],
    ])
    const ga4 = (w.dataLayer ?? [])
      .map((a) => [...(a as IArguments)])
      .find((c) => c[1] === 'purchase')
    expect(ga4?.[2]).toMatchObject({ transaction_id: 'NW-10001', value: 3060, shipping: 80 })
  })

  it('a refresh of the thank-you page does not count it again', () => {
    trackPurchaseOnce(receipt(), NOW)
    trackPurchaseOnce(receipt(), NOW)
    expect(purchases()).toHaveLength(1)
  })

  it('cancelled orders and old links (over a day) are not sales', () => {
    trackPurchaseOnce(receipt({ status: 'CANCELLED' }), NOW)
    trackPurchaseOnce(receipt({ displayNumber: 'NW-9', placedAt: '2026-10-09T11:00:00Z' }), NOW)
    expect(purchases()).toEqual([])
  })
})
