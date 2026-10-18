import type { PaymentStatusView } from '@nowoll/types'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MAX_POLLS, POLL_INTERVAL_MS } from '@/hooks/use-payment-status'
import { isGatewayUrl } from '@/lib/cart-api'
import { useCheckoutStore } from '@/stores/checkout-store'
import { PaymentConfirmation } from './payment-confirmation'
import { PaymentFailed } from './payment-failed'

// Fake GET /payment/status/:id — answers from `answers` in turn (the last one repeats).
const ORDER = '7d3c1a52-8f0e-4a51-9b7e-2f1f5c0f9a10'
const view = (over: Partial<PaymentStatusView> = {}): PaymentStatusView => ({
  orderId: ORDER,
  displayNumber: 'NW-10001',
  status: 'PENDING',
  paymentMethod: 'SSLCOMMERZ',
  paymentStatus: 'PENDING',
  total: '1550',
  canRetry: true,
  ...over,
})
let answers: (PaymentStatusView | 404)[] = []
const statusCalls: string[] = []
const initCalls: string[] = []

function fakeApi(url: string) {
  const res = (status: number, body: object) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))
  if (url.endsWith('/payment/sslcommerz/init')) {
    initCalls.push(url)
    return res(200, {
      success: true,
      data: { redirectUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/xyz' },
    })
  }
  statusCalls.push(url)
  const next = answers.length > 1 ? answers.shift()! : answers[0]!
  return next === 404
    ? res(404, { success: false, error: 'NOT_FOUND', message: 'Order not found' })
    : res(200, { success: true, data: next })
}

beforeEach(() => {
  answers = []
  statusCalls.length = 0
  initCalls.length = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('fetch', vi.fn(fakeApi))
  vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Lets pending fetches finish and moves the clock on. */
const wait = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('thank-you page (PaymentConfirmation)', () => {
  it('shows "Confirming…" and keeps asking until the payment is confirmed', async () => {
    answers = [
      view(),
      view(),
      view({ status: 'CONFIRMED', paymentStatus: 'PAID', canRetry: false }),
    ]
    render(<PaymentConfirmation orderId={ORDER} />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent('Confirming your payment…')

    await wait(POLL_INTERVAL_MS)
    await wait(POLL_INTERVAL_MS)
    expect(screen.getByRole('heading')).toHaveTextContent('Payment received ✓')
    expect(screen.getByText('NW-10001')).toBeVisible()
    expect(statusCalls).toHaveLength(3)
    expect(statusCalls[0]).toMatch(new RegExp(`/api/v1/payment/status/${ORDER}$`))

    await wait(POLL_INTERVAL_MS * 3)
    expect(statusCalls).toHaveLength(3) // stops asking once settled
  })

  it('a paid order ends this checkout (no stale "Pay now" if they come back)', async () => {
    act(() =>
      useCheckoutStore.getState().setPlaced({
        orderId: ORDER,
        orderNumber: 10001,
        displayNumber: 'NW-10001',
        status: 'PENDING',
        paymentMethod: 'SSLCOMMERZ',
        paymentStatus: 'PENDING',
        total: '1550',
        nextAction: 'PAY',
      }),
    )
    answers = [view({ status: 'CONFIRMED', paymentStatus: 'PAID' })]
    render(<PaymentConfirmation orderId={ORDER} />)
    await wait()
    expect(useCheckoutStore.getState().placed).toBeNull()
  })

  it('under review: tells the customer not to pay again', async () => {
    answers = [view({ paymentStatus: 'UNDER_REVIEW', canRetry: false })]
    render(<PaymentConfirmation orderId={ORDER} />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent("We've received your payment")
    expect(screen.getByText("Please don't pay again.")).toBeVisible()
  })

  it('stops after about a minute, offers "Check again" and a way to retry', async () => {
    answers = [view()]
    render(<PaymentConfirmation orderId={ORDER} />)
    for (let i = 0; i <= MAX_POLLS; i++) await wait(POLL_INTERVAL_MS)
    expect(statusCalls).toHaveLength(MAX_POLLS)
    expect(screen.getByRole('status')).toHaveTextContent('confirmed automatically')
    expect(screen.getByRole('link', { name: /Try again/ })).toHaveAttribute(
      'href',
      `/checkout/payment-failed?order=${ORDER}&reason=fail`,
    )

    answers = [view({ status: 'CONFIRMED', paymentStatus: 'PAID' })]
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent('Payment received ✓')
  })

  it('an unknown or missing order id', async () => {
    answers = [404]
    const { unmount } = render(<PaymentConfirmation orderId={ORDER} />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent("We couldn't find that order")
    unmount()
    render(<PaymentConfirmation orderId={null} />)
    expect(screen.getByRole('heading')).toHaveTextContent("We couldn't find that order")
    // The receipt answers for 24 hours (security audit) — older orders: tracking.
    expect(screen.getByRole('link', { name: 'Track your order' })).toHaveAttribute(
      'href',
      '/orders/track',
    )
  })
})

describe('payment-failed page', () => {
  it('while the order is still held: "Try paying again" opens a fresh payment page', async () => {
    answers = [view()]
    render(<PaymentFailed orderId={ORDER} reason="cancel" />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent('Payment cancelled')
    fireEvent.click(screen.getByRole('button', { name: /Try paying again — ৳1,550/ }))
    await wait()
    expect(initCalls).toHaveLength(1)
    expect(window.location.assign).toHaveBeenCalledWith(
      'https://sandbox.sslcommerz.com/EasyCheckOut/xyz',
    )
  })

  it('an expired order: explains, and offers to keep shopping (no pay button)', async () => {
    answers = [view({ status: 'CANCELLED', paymentStatus: 'CANCELLED', canRetry: false })]
    render(<PaymentFailed orderId={ORDER} reason="fail" />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent("Your payment didn't go through")
    expect(screen.getByText(/has expired because it wasn't paid in time/)).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('paid after all (SSLCommerz confirmed it) → good news, no pay button', async () => {
    answers = [view({ status: 'CONFIRMED', paymentStatus: 'PAID', canRetry: false })]
    render(<PaymentFailed orderId={ORDER} reason="fail" />)
    await wait()
    expect(screen.getByRole('heading')).toHaveTextContent('Good news')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('isGatewayUrl — only SSLCommerz pages, only https', () => {
  it.each([
    ['https://sandbox.sslcommerz.com/EasyCheckOut/abc', true],
    ['https://securepay.sslcommerz.com/gwprocess/v4/x', true],
    ['http://sandbox.sslcommerz.com/x', false],
    ['https://sslcommerz.com.evil.example/x', false],
    ['https://evil.example/https://sslcommerz.com', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isGatewayUrl(url)).toBe(ok)
  })
})
