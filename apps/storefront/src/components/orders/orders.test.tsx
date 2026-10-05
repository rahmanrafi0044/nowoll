import type { OrderReceiptView, OrderTrackingView } from '@nowoll/types'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CheckoutSuccess } from '@/components/checkout/checkout-success'
import { useCheckoutStore } from '@/stores/checkout-store'
import { TrackOrder } from './track-order'

const ORDER = '7d3c1a52-8f0e-4a51-9b7e-2f1f5c0f9a10'
const line = {
  productName: 'Oxford Shirt',
  variantLabel: 'M / Blue',
  imageUrl: null,
  unitPrice: '1490',
  quantity: 1,
  lineTotal: '1490',
}
const receipt = (over: Partial<OrderReceiptView> = {}): OrderReceiptView => ({
  orderId: ORDER,
  displayNumber: 'NW-10001',
  placedAt: '2026-10-05T04:00:00.000Z',
  status: 'PENDING',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  items: [line],
  total: '1440',
  canPay: false,
  customerName: 'Rafi Rahman',
  deliveryAddress: {
    addressLine1: 'House 12, Road 5',
    addressLine2: null,
    area: 'Dhanmondi',
    district: 'Dhaka',
    division: 'Dhaka',
    postalCode: '1209',
  },
  deliveryZone: 'Inside Dhaka',
  totals: {
    subtotal: '1490',
    discount: '110',
    discountCode: 'WELCOME',
    shippingFee: '60',
    vatRate: '0',
    vatAmount: '0',
    total: '1440',
  },
  ...over,
})
const tracking = (over: Partial<OrderTrackingView> = {}): OrderTrackingView => ({
  displayNumber: 'NW-10001',
  placedAt: '2026-10-05T04:00:00.000Z',
  status: 'SHIPPED',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  items: [line],
  total: '1550',
  canPay: false,
  payOrderId: null,
  deliveryArea: { area: 'Dhanmondi', district: 'Dhaka', division: 'Dhaka' },
  courierName: 'Steadfast',
  trackingNumber: 'SF123456',
  timeline: [
    { status: 'PENDING', at: '2026-10-05T04:00:00.000Z' },
    { status: 'CONFIRMED', at: '2026-10-05T05:00:00.000Z' },
    { status: 'PROCESSING', at: '2026-10-06T04:00:00.000Z' },
    { status: 'SHIPPED', at: '2026-10-06T10:00:00.000Z' },
  ],
  ...over,
})

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let answer: (url: string) => [number, object]

beforeEach(() => {
  calls = []
  answer = () => [404, { success: false, error: 'NOT_FOUND', message: 'Not found' }]
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      const [status, body] = answer(url)
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }),
  )
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

const ok = (data: object): [number, object] => [200, { success: true, data }]

describe('confirmation page (CheckoutSuccess)', () => {
  it('cash on delivery: thank-you, what happens next, and the full receipt', async () => {
    act(() => useCheckoutStore.getState().setPayment('COD'))
    answer = () => ok(receipt())
    render(<CheckoutSuccess orderId={ORDER} />)

    expect(
      await screen.findByRole('heading', { name: 'Thank you — your order is placed!' }),
    ).toBeVisible()
    expect(calls[0]!.url).toMatch(new RegExp(`/api/v1/orders/${ORDER}/receipt$`))
    expect(screen.getByText(/We'll call you shortly to confirm/)).toHaveTextContent('৳1,440')
    expect(screen.getByText('Oxford Shirt')).toBeVisible()
    expect(screen.getByText('Discount (WELCOME)')).toBeVisible()
    expect(screen.queryByText(/VAT/)).toBeNull() // 0% → no line
    expect(screen.getByText('Delivery (Inside Dhaka)')).toBeVisible()
    expect(screen.getByText('House 12, Road 5, Dhanmondi, Dhaka, Dhaka, 1209')).toBeVisible()
    expect(screen.getByText(/pay ৳1,440 when it arrives/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'track your order' })).toHaveAttribute(
      'href',
      '/orders/track',
    )
    // The checkout is cleared in an effect that runs just AFTER the page appears —
    // wait for it (checking immediately was flaky on a busy machine / in CI).
    await waitFor(() => expect(useCheckoutStore.getState().payment).toBeNull()) // this checkout is finished
  })

  it('online payment: the live payment status on top of the receipt', async () => {
    answer = (url) =>
      url.endsWith('/receipt')
        ? ok(receipt({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'PAID', status: 'CONFIRMED' }))
        : ok({
            orderId: ORDER,
            displayNumber: 'NW-10001',
            status: 'CONFIRMED',
            paymentMethod: 'SSLCOMMERZ',
            paymentStatus: 'PAID',
            total: '1440',
            canRetry: false,
          })
    render(<CheckoutSuccess orderId={ORDER} />)
    expect(await screen.findByRole('heading', { name: 'Payment received ✓' })).toBeVisible()
    expect(screen.getByText('Paid online')).toBeVisible()
    expect(screen.getByText('Oxford Shirt')).toBeVisible()
  })

  it('an unknown or missing order', async () => {
    const { unmount } = render(<CheckoutSuccess orderId={ORDER} />)
    expect(
      await screen.findByRole('heading', { name: "We couldn't find that order" }),
    ).toBeVisible()
    unmount()
    render(<CheckoutSuccess orderId={null} />)
    expect(screen.getByRole('heading', { name: "We couldn't find that order" })).toBeVisible()
  })
})

describe('Track your order', () => {
  const fill = (orderNumber: string, contact: string) => {
    fireEvent.change(screen.getByLabelText('Order number'), { target: { value: orderNumber } })
    fireEvent.change(screen.getByLabelText('Email or mobile number', { exact: false }), {
      target: { value: contact },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Track order' }))
  }

  it('asks for both details before sending anything', () => {
    render(<TrackOrder />)
    fireEvent.click(screen.getByRole('button', { name: 'Track order' }))
    expect(screen.getByText('Enter your order number, e.g. NW-10001')).toBeVisible()
    expect(screen.getByText('Enter the email or mobile number you used at checkout')).toBeVisible()
    expect(calls).toEqual([])
  })

  it('sends the details in a POST body — never in the URL', async () => {
    answer = () => ok(tracking())
    render(<TrackOrder />)
    fill('NW-10001', 'rafi@example.com')
    await screen.findByRole('heading', { name: 'Order NW-10001' })
    expect(calls).toEqual([
      {
        url: expect.stringMatching(/\/api\/v1\/orders\/track$/),
        method: 'POST',
        body: { orderNumber: 'NW-10001', contact: 'rafi@example.com' },
      },
    ])
  })

  it('shows the progress, the courier and tracking number, area only', async () => {
    answer = () => ok(tracking())
    render(<TrackOrder />)
    fill('10001', '01712345678')

    const progress = await screen.findByRole('list', { name: 'Order progress' })
    const steps = within(progress).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringMatching(/^✓Order placed \(done\)/),
      expect.stringMatching(/^✓Confirmed \(done\)/),
      expect.stringMatching(/^✓Being packed \(done\)/),
      expect.stringMatching(/^✓On its way \(done\)/),
      'Delivered (not yet)',
    ])
    expect(steps[3]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText(/Sent with/)).toHaveTextContent('Steadfast — tracking number SF123456')
    expect(screen.getByText('Dhanmondi, Dhaka, Dhaka')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Pay now/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Track another order' }))
    expect(screen.getByLabelText('Order number')).toHaveValue('')
  })

  it('a cancelled order says so (no progress list)', async () => {
    answer = () =>
      ok(
        tracking({
          status: 'CANCELLED',
          courierName: null,
          trackingNumber: null,
          timeline: [
            { status: 'PENDING', at: '2026-10-05T04:00:00.000Z' },
            { status: 'CANCELLED', at: '2026-10-05T04:35:00.000Z' },
          ],
        }),
      )
    render(<TrackOrder />)
    fill('NW-10001', 'rafi@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent(/^Cancelled on 5 Oct 2026/)
    expect(screen.queryByRole('list', { name: 'Order progress' })).toBeNull()
  })

  it('an unpaid online order can be paid from here', async () => {
    answer = (url) =>
      url.endsWith('/init')
        ? ok({ redirectUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/t1' })
        : ok(
            tracking({
              status: 'PENDING',
              paymentMethod: 'SSLCOMMERZ',
              canPay: true,
              payOrderId: ORDER,
              courierName: null,
              trackingNumber: null,
              timeline: [{ status: 'PENDING', at: '2026-10-05T04:00:00.000Z' }],
            }),
          )
    render(<TrackOrder />)
    fill('NW-10001', 'rafi@example.com')
    fireEvent.click(await screen.findByRole('button', { name: /Pay now — ৳1,550/ }))
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://sandbox.sslcommerz.com/EasyCheckOut/t1',
      ),
    )
    expect(calls.at(-1)!.body).toEqual({ orderId: ORDER })
  })

  it('not found and too-many-tries messages', async () => {
    answer = () => [
      404,
      {
        success: false,
        error: 'NOT_FOUND',
        message: "We couldn't find an order with those details.",
      },
    ]
    render(<TrackOrder />)
    fill('NW-10001', 'x@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find an order")

    answer = () => [429, { success: false, error: 'TOO_MANY_REQUESTS', message: 'Too many' }]
    fireEvent.click(screen.getByRole('button', { name: 'Track order' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Too many tries — please wait a minute'),
    )
  })
})
