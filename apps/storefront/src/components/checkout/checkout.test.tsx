import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useCartStore } from '@/stores/cart-store'
import { useCheckoutStore } from '@/stores/checkout-store'
import { CheckoutFlow } from './checkout-flow'

// Fake POST /checkout/quote: Dhaka → ৳60, elsewhere ৳120; VAT from `vatRate`.
let vatRate = 0
let failWith: { status: number; error: string; message: string } | null = null
const quoteBodies: { district?: string; email?: string; discountCode?: string }[] = []

function fakeApi(_url: string, init: RequestInit) {
  const body = JSON.parse(String(init.body))
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
  failWith = null
  quoteBodies.length = 0
  vi.stubGlobal('fetch', vi.fn(fakeApi))
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
    expect(within(review).getByRole('button', { name: 'Place order' })).toBeDisabled()
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
