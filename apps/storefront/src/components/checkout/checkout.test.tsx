import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useCartStore } from '@/stores/cart-store'
import { useCheckoutStore } from '@/stores/checkout-store'
import { useSessionStore } from '@/stores/session-store'
import { CheckoutFlow } from './checkout-flow'
import { PaymentStep } from './payment-step'

// Fake POST /checkout/quote: Dhaka → ৳60, elsewhere ৳120; VAT from `vatRate`.
let vatRate = 0
/** What the fake API says about payment (step 38c); null = today's: both on, no minimum. */
let paymentRules: unknown = null
const BOTH_ON = {
  options: [
    {
      method: 'SSLCOMMERZ',
      title: 'Pay online',
      description: 'Card, bKash, Nagad or Rocket — on SSLCommerz’s secure page',
      available: true,
      problem: null,
    },
    {
      method: 'COD',
      title: 'Cash on delivery',
      description: 'Pay the courier when your parcel arrives',
      available: true,
      problem: null,
    },
  ],
  minimumOrder: null,
}
let failWith: { status: number; error: string; message: string } | null = null
const quoteBodies: { district?: string; email?: string; discountCode?: string }[] = []
type OrderCall = { body: Record<string, unknown>; key: string }
const orderCalls: OrderCall[] = []
let orderAnswer: (() => Promise<Response>) | null = null
const initCalls: string[] = []
let initAnswer: (() => Promise<Response>) | null = null
const json = (status: number, body: object) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

const savedAddresses: Record<string, unknown>[] = []

function fakeApi(url: string, init: RequestInit) {
  if (url.endsWith('/addresses') && init.method !== 'POST')
    return json(200, { success: true, data: [] }) // signed in, no saved addresses yet
  const body = JSON.parse(String(init.body))
  if (url.endsWith('/addresses')) {
    savedAddresses.push(body)
    return json(201, { success: true, data: { id: 'a1', ...body } })
  }
  if (url.endsWith('/payment/sslcommerz/init')) {
    initCalls.push(body.orderId)
    if (initAnswer) return initAnswer()
    return json(200, {
      success: true,
      data: { redirectUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/abc' },
    })
  }
  if (url.endsWith('/orders')) {
    orderCalls.push({ body, key: (init.headers as Record<string, string>)['idempotency-key']! })
    if (orderAnswer) return orderAnswer()
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            orderId: 'o1',
            orderNumber: 10001,
            displayNumber: 'NW-10001',
            status: 'PENDING',
            paymentMethod: body.paymentMethod,
            paymentStatus: 'PENDING',
            total: body.expectedTotal,
            nextAction: body.paymentMethod === 'SSLCOMMERZ' ? 'PAY' : 'NONE',
          },
        }),
        { status: 201 },
      ),
    )
  }
  quoteBodies.push(body)
  if (failWith)
    return Promise.resolve(
      new Response(JSON.stringify({ success: false, ...failWith }), { status: failWith.status }),
    )
  const subtotal = 1490
  const zone = !body.district
    ? null
    : body.district === 'Dhaka'
      ? { name: 'Inside Dhaka', fee: '60', min: 1, max: 3 }
      : { name: 'Outside Dhaka', fee: '120', min: 3, max: 5 }
  const shippingFee = zone ? Number(zone.fee) : 0
  const vat = (subtotal * vatRate) / 100
  return Promise.resolve(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          lines: [
            {
              variantId: 'v1',
              productId: 'p1',
              productName: 'Oxford Shirt',
              variantLabel: 'M / Blue',
              sku: 'S1',
              unitPrice: '1490',
              quantity: 1,
              lineTotal: '1490',
            },
          ],
          totals: {
            subtotal: '1490',
            discount: '0',
            afterDiscount: '1490',
            shippingFee: String(shippingFee),
            freeShipping: false,
            vatRate: String(vatRate),
            vatAmount: String(vat),
            total: String(subtotal + shippingFee + vat),
          },
          discount: null,
          discountProblem: null,
          payment: paymentRules ?? BOTH_ON,
          shipping: zone && {
            id: 'z',
            code: 'Z',
            name: zone.name,
            fee: zone.fee,
            freeShippingThreshold: null,
            estimatedDaysMin: zone.min,
            estimatedDaysMax: zone.max,
            districts: [],
            isDefault: false,
          },
        },
      }),
    ),
  )
}

beforeEach(async () => {
  vatRate = 0
  paymentRules = null
  failWith = null
  quoteBodies.length = 0
  orderCalls.length = 0
  orderAnswer = null
  initCalls.length = 0
  initAnswer = null
  savedAddresses.length = 0
  useSessionStore.setState({ status: 'signed-out', user: null })
  vi.stubGlobal('fetch', vi.fn(fakeApi))
  // jsdom can't navigate: record where the browser would have been sent.
  vi.stubGlobal('location', { ...window.location, assign: vi.fn(), replace: vi.fn() })
  useCartStore.getState().clear()
  useCheckoutStore.getState().reset()
  await act(() => useCartStore.persist.rehydrate())
  act(() =>
    useCartStore.getState().addItem({
      variantId: 'v1',
      productId: 'p1',
      productName: 'Oxford Shirt',
      productSlug: 'oxford-shirt',
      variantLabel: 'M / Blue',
      sku: 'S1',
      imageUrl: null,
      unitPrice: 1490,
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })
const step = (title: RegExp) => screen.getByRole('region', { name: title })

async function fillContact() {
  type('Full name', 'Rafi Rahman')
  type('Email', ' Rafi@Example.com ')
  type('Mobile number', '017 1234 5678')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to address' }))
}

async function fillAddress(district = 'Dhaka', division = 'Dhaka') {
  fireEvent.change(screen.getByLabelText('Division'), { target: { value: division } })
  fireEvent.change(screen.getByLabelText('District'), { target: { value: district } })
  type('Area / thana', 'Dhanmondi')
  fireEvent.change(screen.getByRole('textbox', { name: /^Address$/ }), {
    target: { value: 'House 12, Road 5' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }))
}

describe('checkout', () => {
  it('walks contact → address → delivery → payment → review', async () => {
    render(<CheckoutFlow />)
    expect(await screen.findByRole('button', { name: 'Continue to address' })).toBeInTheDocument()

    await fillContact()
    expect(useCheckoutStore.getState().contact).toEqual({
      fullName: 'Rafi Rahman',
      email: 'rafi@example.com',
      phone: '+8801712345678',
    })

    await fillAddress('Dhaka')
    // The quote is re-asked with the district → the Inside Dhaka fee appears
    expect(await within(step(/Delivery$/)).findByText('Inside Dhaka')).toBeInTheDocument()
    expect(within(step(/Delivery$/)).getByText('Delivery in 1–3 days')).toBeInTheDocument()
    expect(quoteBodies.at(-1)).toMatchObject({ district: 'Dhaka', email: 'rafi@example.com' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))

    fireEvent.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))

    const review = step(/Review and place order/)
    expect(
      within(review).getByText('Rafi Rahman · rafi@example.com · +8801712345678'),
    ).toBeInTheDocument()
    expect(
      within(review).getByText(/House 12, Road 5, Dhanmondi, Dhaka, Dhaka/),
    ).toBeInTheDocument()
    expect(within(review).getByText('Pay on delivery')).toBeInTheDocument()
    expect(within(review).getByText('৳1,550')).toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: 'Place order' }))

    // The order request: a request key, the reviewed total, normalized details
    // Step 21: every non-pending-payment order goes to the confirmation page (replace: no "Back" into checkout)
    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith('/checkout/success?order=o1'),
    )
    expect(screen.getByRole('link', { name: 'View your order' })).toHaveAttribute(
      'href',
      '/checkout/success?order=o1',
    )
    expect(orderCalls).toHaveLength(1)
    expect(orderCalls[0]!.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(orderCalls[0]!.body).toMatchObject({
      paymentMethod: 'COD',
      expectedTotal: '1550',
      contact: { email: 'rafi@example.com', phone: '+8801712345678' },
      address: { district: 'Dhaka', area: 'Dhanmondi' },
      items: [{ variantId: 'v1', quantity: 1 }],
    })
    expect(useCartStore.getState().items).toEqual([]) // the bag is emptied
  })

  it('validates contact details with the shared rules', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    type('Email', 'nope')
    type('Mobile number', '12345')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to address' }))
    expect(screen.getByText('Enter your full name')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText(/valid Bangladeshi mobile number/)).toBeInTheDocument()
    expect(useCheckoutStore.getState().done).toEqual([])
  })

  it('only offers districts of the chosen division, and clears the district when the division changes', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    expect(screen.getByLabelText('District')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Division'), { target: { value: 'Sylhet' } })
    const options = within(screen.getByLabelText('District'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Choose…', 'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'])
    fireEvent.change(screen.getByLabelText('District'), { target: { value: 'Sylhet' } })
    fireEvent.change(screen.getByLabelText('Division'), { target: { value: 'Dhaka' } })
    expect(screen.getByLabelText('District')).toHaveValue('')
  })

  it('outside Dhaka gets the outside fee', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    await fillAddress('Sylhet', 'Sylhet')
    expect(await within(step(/Delivery$/)).findByText('Outside Dhaka')).toBeInTheDocument()
    expect(within(step(/Delivery$/)).getByText('৳120')).toBeInTheDocument()
  })

  it('requires a payment choice', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Choose how you'd like to pay.")
  })

  it('shows a VAT line only when the rate is above 0% (decision #1)', async () => {
    const { unmount } = render(<CheckoutFlow />)
    const summary = await screen.findByRole('complementary', { name: 'Order summary' })
    await within(summary).findByText('Subtotal')
    expect(within(summary).queryByText(/VAT/)).not.toBeInTheDocument()
    unmount()

    vatRate = 7.5
    render(<CheckoutFlow />)
    expect(await screen.findByText('VAT (7.5%)')).toBeInTheDocument()
  })

  it('completed steps can be edited; later steps cannot be skipped to', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    act(() => useCheckoutStore.getState().goTo('review'))
    expect(useCheckoutStore.getState().step).toBe('contact')
    await fillContact()
    fireEvent.click(screen.getByRole('button', { name: 'Edit contact' }))
    expect(screen.getByLabelText('Full name', { exact: false })).toHaveValue('Rafi Rahman')
  })

  it('remembers progress for this tab only (sessionStorage, decision #5)', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    expect(JSON.parse(sessionStorage.getItem('nowoll-checkout')!).state.contact.email).toBe(
      'rafi@example.com',
    )
    expect(localStorage.getItem('nowoll-checkout')).toBeNull()
  })

  it('sends people back to the bag if an item became unavailable', async () => {
    failWith = { status: 400, error: 'ITEMS_UNAVAILABLE', message: 'Some items…' }
    render(<CheckoutFlow />)
    expect(await screen.findByRole('link', { name: 'Review your bag' })).toHaveAttribute(
      'href',
      '/cart',
    )
  })

  it('shows the empty-bag message', async () => {
    act(() => useCartStore.getState().clear())
    render(<CheckoutFlow />)
    expect(await screen.findByText('Your bag is empty')).toBeInTheDocument()
  })
})

describe('placing the order', () => {
  async function toReview() {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    await within(step(/Review and place order/)).findByText('৳1,550')
    return () => fireEvent.click(screen.getByRole('button', { name: 'Place order' }))
  }
  const fail = (status: number, error: string, message: string) => () =>
    Promise.resolve(new Response(JSON.stringify({ success: false, error, message }), { status }))

  it('refused by the shop’s payment rules (step 38c): cash-on-delivery limit → another way to pay; minimum → the bag', async () => {
    const place = await toReview()
    orderAnswer = fail(
      422,
      'COD_LIMIT',
      'Cash on delivery is available for orders up to ৳1,000. Please pay online.',
    )
    place()
    expect(await screen.findByRole('alert')).toHaveTextContent(/up to ৳1,000/)
    expect(screen.getByRole('button', { name: 'Choose another way to pay' })).toBeVisible()
    orderAnswer = fail(422, 'BELOW_MINIMUM_ORDER', 'The minimum order is ৳2,000 — add ৳510 more.')
    place()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/minimum order is ৳2,000/),
    )
    expect(screen.getByRole('link', { name: 'Review your bag' })).toHaveAttribute('href', '/cart')
  })

  it('a retry after a network error sends the SAME key (no double order possible)', async () => {
    const place = await toReview()
    orderAnswer = () => Promise.reject(new Error('offline'))
    place()
    expect(await screen.findByRole('alert')).toHaveTextContent(/safe to try again/)
    orderAnswer = null
    place()
    await waitFor(() => expect(window.location.replace).toHaveBeenCalled())
    expect(orderCalls).toHaveLength(2)
    expect(orderCalls[0]!.key).toBe(orderCalls[1]!.key)
  })

  it('PRICE_CHANGED shows the message and fetches the new total', async () => {
    const place = await toReview()
    const before = quoteBodies.length
    orderAnswer = fail(
      409,
      'PRICE_CHANGED',
      'Prices changed since you reviewed your order — the total is now ৳1600.',
    )
    place()
    expect(await screen.findByRole('alert')).toHaveTextContent('the total is now ৳1600')
    await waitFor(() => expect(quoteBodies.length).toBeGreaterThan(before))
  })

  it('OUT_OF_STOCK sends the customer back to the bag', async () => {
    const place = await toReview()
    orderAnswer = fail(409, 'OUT_OF_STOCK', 'Sorry — Oxford Shirt (M / Blue) just sold out.')
    place()
    expect(await screen.findByRole('link', { name: 'Review your bag' })).toHaveAttribute(
      'href',
      '/cart',
    )
  })

  it('a discount problem offers to remove the code', async () => {
    act(() => useCartStore.getState().setDiscountCode('OLD'))
    const place = await toReview()
    orderAnswer = fail(422, 'DISCOUNT_EXPIRED', 'This code has expired.')
    place()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the code and continue' }))
    expect(useCartStore.getState().discountCode).toBeNull()
  })

  async function toOnlineReview() {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('radio', { name: /Pay online/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    await within(step(/Review and place order/)).findByText('৳1,550')
    return () => fireEvent.click(screen.getByRole('button', { name: 'Place order and pay' }))
  }

  it('online payment: places the order, then sends the customer to SSLCommerz', async () => {
    const place = await toOnlineReview()
    place()
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://sandbox.sslcommerz.com/EasyCheckOut/abc',
      ),
    )
    expect(orderCalls[0]!.body.paymentMethod).toBe('SSLCOMMERZ')
    expect(initCalls).toEqual(['o1'])
    expect(useCartStore.getState().items).toEqual([]) // the order exists — the bag is done
  })

  it('if the payment page cannot open, the order is kept and "Pay now" tries again', async () => {
    const place = await toOnlineReview()
    initAnswer = () =>
      json(503, {
        success: false,
        error: 'PAYMENT_UNREACHABLE',
        message: 'The payment service is not responding. Please try again in a minute.',
      })
    place()
    expect(await screen.findByRole('heading', { name: 'Your order is reserved' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('not responding')
    expect(window.location.assign).not.toHaveBeenCalled()

    initAnswer = null
    fireEvent.click(screen.getByRole('button', { name: /Pay now — ৳1,550/ }))
    await waitFor(() => expect(window.location.assign).toHaveBeenCalled())
    expect(initCalls).toEqual(['o1', 'o1'])
  })

  it('never follows a payment link that is not SSLCommerz (open-redirect guard)', async () => {
    const place = await toOnlineReview()
    initAnswer = () =>
      json(200, { success: true, data: { redirectUrl: 'https://evil.example/sslcommerz.com' } })
    place()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened')
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('when online payment is unavailable, offers to choose another way to pay', async () => {
    const place = await toOnlineReview()
    orderAnswer = fail(
      422,
      'ONLINE_PAYMENT_UNAVAILABLE',
      "Online payment isn't available right now. Please choose cash on delivery.",
    )
    place()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose another way to pay' }))
    expect(await screen.findByRole('radio', { name: /Cash on delivery/ })).toBeVisible()
  })
})

describe('PaymentStep — the options come from the API (step 38c)', () => {
  it('an option the shop can’t offer for this order is greyed out with the reason; the admin’s wording shows', () => {
    render(
      <PaymentStep
        options={[
          { ...BOTH_ON.options[0]!, description: 'bKash or card' } as never,
          {
            ...BOTH_ON.options[1]!,
            available: false,
            problem: {
              code: 'COD_LIMIT',
              message: 'Cash on delivery is available for orders up to ৳10,000. Please pay online.',
            },
          } as never,
        ]}
      />,
    )
    expect(screen.getByRole('radio', { name: /Pay online/ })).toBeEnabled()
    expect(screen.getByText('bKash or card')).toBeVisible()
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeDisabled()
    expect(screen.getByText(/available for orders up to ৳10,000/)).toBeVisible()
  })

  it('while the summary is still loading, both options stay open', () => {
    render(<PaymentStep options={null} />)
    expect(screen.getByRole('radio', { name: /Pay online/ })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /Cash on delivery/ })).toBeEnabled()
  })

  it('below the shop’s minimum order: the review says how much is missing and Place order is off', async () => {
    paymentRules = { ...BOTH_ON, minimumOrder: { amount: '1500', shortBy: '10' } }
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    const review = within(step(/Review and place order/))
    expect(await review.findByText(/The minimum order is ৳1,500/)).toHaveTextContent('add ৳10 more')
    expect(review.getByRole('button', { name: 'Place order' })).toBeDisabled()
  })
})

describe('signed-in checkout (step 23)', () => {
  it('a new address with "Save to my addresses" ticked is saved after the order', async () => {
    useSessionStore.setState({
      status: 'signed-in',
      user: {
        id: 'u1',
        email: 'rafi@example.com',
        fullName: 'Rafi Rahman',
        phone: '+8801712345678',
      },
    })
    render(<CheckoutFlow />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to address' })) // pre-filled from the account
    expect(await screen.findByLabelText('Save to my addresses')).toBeChecked()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    await within(step(/Review and place order/)).findByText('৳1,550')
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }))

    await waitFor(() => expect(window.location.replace).toHaveBeenCalled())
    expect(savedAddresses).toEqual([
      {
        fullName: 'Rafi Rahman',
        phone: '+8801712345678',
        division: 'Dhaka',
        district: 'Dhaka',
        addressLine1: 'House 12, Road 5',
        area: 'Dhanmondi',
        addressLine2: null,
        postalCode: null,
      },
    ])
  })

  it('guests never save an address', async () => {
    render(<CheckoutFlow />)
    await screen.findByRole('button', { name: 'Continue to address' })
    await fillContact()
    expect(screen.queryByLabelText('Save to my addresses')).toBeNull()
    await fillAddress()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
    fireEvent.click(screen.getByRole('radio', { name: /Cash on delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    await within(step(/Review and place order/)).findByText('৳1,550')
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }))
    await waitFor(() => expect(window.location.replace).toHaveBeenCalled())
    expect(savedAddresses).toEqual([])
  })
})
