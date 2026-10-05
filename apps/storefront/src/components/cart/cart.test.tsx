import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CartButton } from '@/components/cart-button'
import { useCartStore } from '@/stores/cart-store'
import { useUiStore } from '@/stores/ui-store'
import { CartDrawer } from './cart-drawer'
import { CartPageClient } from './cart-page-client'
import { QuantityStepper } from './quantity-stepper'

const item = (variantId: string, unitPrice = 1490, quantity = 1) => ({
  variantId,
  productId: `p-${variantId}`,
  productName: `Shirt ${variantId}`,
  productSlug: `shirt-${variantId}`,
  variantLabel: 'M / Blue',
  sku: `SKU-${variantId}`,
  imageUrl: null,
  unitPrice,
  quantity,
})

// A fake API. Each test sets today's prices/statuses and the discount answer.
type Line = { status: 'ok' | 'unavailable' | 'insufficient_stock'; price?: string }
let today: Record<string, Line> = {}
let discountAnswer: { status: number; body: object } = {
  status: 422,
  body: { success: false, error: 'DISCOUNT_NOT_VALID', message: "This code isn't valid." },
}
const calls: string[] = []

function fakeApi(url: string, init: RequestInit) {
  const body = JSON.parse(String(init.body)) as { items: { variantId: string; quantity: number }[] }
  calls.push(url.replace('http://localhost:3001/api/v1', ''))
  if (url.endsWith('/cart/price')) {
    const lines = body.items.map(({ variantId, quantity }) => {
      const t = today[variantId] ?? { status: 'ok', price: '1490' }
      if (t.status === 'unavailable') return { variantId, quantity, status: 'unavailable' }
      return {
        variantId,
        quantity,
        status: t.status,
        productName: `Shirt ${variantId}`,
        unitPrice: t.price ?? '1490',
        lineTotal: String(Number(t.price ?? 1490) * quantity),
      }
    })
    const subtotal = lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0)
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            lines,
            subtotal: String(subtotal),
            canCheckout: lines.every((l) => l.status === 'ok'),
          },
        }),
      ),
    )
  }
  return Promise.resolve(
    new Response(JSON.stringify(discountAnswer.body), { status: discountAnswer.status }),
  )
}

beforeEach(async () => {
  today = {}
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(fakeApi))
  useCartStore.getState().clear()
  useUiStore.getState().closeCart()
  await act(() => useCartStore.persist.rehydrate())
})
afterEach(() => vi.unstubAllGlobals())

const add = (...items: ReturnType<typeof item>[]) =>
  act(() => {
    for (const i of items) {
      const { quantity, ...rest } = i
      useCartStore.getState().addItem(rest, quantity)
    }
  })

describe('/cart page', () => {
  it('shows an empty bag with a way back to the shop', () => {
    render(<CartPageClient />)
    expect(screen.getByText('Your bag is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
  })

  it("updates a changed price to today's and says so (decision #1)", async () => {
    await add(item('a', 1490))
    today = { a: { status: 'ok', price: '1290' } }
    render(<CartPageClient />)
    expect(await screen.findByText("Price updated to today's price.")).toBeInTheDocument()
    expect(useCartStore.getState().items[0]!.unitPrice).toBe(1290)
    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout')
  })

  it('keeps an unavailable item visible, blocks checkout until it is removed (decision #2)', async () => {
    await add(item('a'), item('gone'))
    today = { gone: { status: 'unavailable' } }
    render(<CartPageClient />)
    expect(await screen.findByText('No longer available — please remove it.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Checkout' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Some items need your attention')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Shirt gone (M / Blue)' }))
    expect(await screen.findByRole('link', { name: 'Checkout' })).toBeInTheDocument()
  })

  it('asks to reduce the quantity when stock is short (decision #3)', async () => {
    await add(item('a', 1490, 5))
    today = { a: { status: 'insufficient_stock', price: '1490' } }
    render(<CartPageClient />)
    expect(await screen.findByText('Only a few left — reduce the quantity.')).toBeInTheDocument()
  })

  it('changes quantity with the stepper and sends ONE request for rapid taps', async () => {
    await add(item('a'))
    render(<CartPageClient />)
    await screen.findByRole('link', { name: 'Checkout' })
    calls.length = 0
    const plus = screen.getByRole('button', { name: 'Increase quantity of Shirt a (M / Blue)' })
    // Three taps ~100 ms apart, like a real person — not in the same instant.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(plus)
      await act(() => new Promise((r) => setTimeout(r, 100)))
    }
    expect(screen.getByText('৳5,960')).toBeInTheDocument() // the line total updates instantly
    expect(useCartStore.getState().items[0]!.quantity).toBe(4)
    // …but only ONE price request is sent, after the short pause — and no more after that.
    await waitFor(() => expect(calls.filter((c) => c === '/cart/price')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 600))
    expect(calls.filter((c) => c === '/cart/price')).toHaveLength(1)
  })

  it('applies a discount code, shows it in the summary, and lets you remove it', async () => {
    await add(item('a'))
    discountAnswer = {
      status: 200,
      body: {
        success: true,
        data: {
          code: 'SAVE10',
          type: 'PERCENTAGE',
          value: '10',
          subtotal: '1490',
          discountAmount: '149',
          subtotalAfterDiscount: '1341',
        },
      },
    }
    render(<CartPageClient />)
    fireEvent.change(await screen.findByLabelText('Discount code'), { target: { value: 'save10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByText('Discount (SAVE10)')).toBeInTheDocument()
    expect(screen.getByText('−৳149')).toBeInTheDocument()
    expect(screen.getByText('৳1,341')).toBeInTheDocument()
    expect(useCartStore.getState().discountCode).toBe('SAVE10')

    fireEvent.click(screen.getByRole('button', { name: 'Remove code SAVE10' }))
    expect(screen.queryByText('Discount (SAVE10)')).not.toBeInTheDocument()
  })

  it("shows the API's reason when a code can't be used", async () => {
    await add(item('a'))
    discountAnswer = {
      status: 422,
      body: {
        success: false,
        error: 'DISCOUNT_MIN_ORDER',
        message: 'Add ৳210 more to use this code (minimum order ৳1,700).',
      },
    }
    render(<CartPageClient />)
    fireEvent.change(await screen.findByLabelText('Discount code'), { target: { value: 'BIG' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText(/Add ৳210 more/)).toBeInTheDocument()
    expect(useCartStore.getState().discountCode).toBeNull()
  })

  it('re-checks an applied code when the bag changes and explains if it no longer applies', async () => {
    await add(item('a', 1490, 2))
    act(() => useCartStore.getState().setDiscountCode('BIG'))
    discountAnswer = {
      status: 200,
      body: {
        success: true,
        data: {
          code: 'BIG',
          type: 'FIXED_AMOUNT',
          value: '200',
          subtotal: '2980',
          discountAmount: '200',
          subtotalAfterDiscount: '2780',
        },
      },
    }
    render(<CartPageClient />)
    expect(await screen.findByText('Discount (BIG)')).toBeInTheDocument()

    discountAnswer = {
      status: 422,
      body: {
        success: false,
        error: 'DISCOUNT_MIN_ORDER',
        message: 'Add ৳510 more to use this code.',
      },
    }
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity of Shirt a (M / Blue)' }))
    expect(await screen.findByText('Add ৳510 more to use this code.')).toBeInTheDocument()
    expect(screen.queryByText('Discount (BIG)')).not.toBeInTheDocument()
  })
})

describe('bag drawer', () => {
  it('opens from the bag icon, shows the lines and closes', async () => {
    await add(item('a'))
    render(
      <>
        <CartButton />
        <CartDrawer />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Shopping bag, 1 item/ }))
    const drawer = screen.getByRole('dialog', { name: 'Your bag (1)' })
    expect(await within(drawer).findByRole('link', { name: 'Checkout' })).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: 'View bag' })).toHaveAttribute('href', '/cart')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close bag' }))
    expect(useUiStore.getState().cartOpen).toBe(false)
  })
})

describe('<QuantityStepper />', () => {
  it('stays between 1 and 10', () => {
    const onChange = vi.fn()
    const { rerender } = render(<QuantityStepper value={1} onChange={onChange} label="Tee" />)
    expect(screen.getByRole('button', { name: 'Decrease quantity of Tee' })).toBeDisabled()
    rerender(<QuantityStepper value={10} onChange={onChange} label="Tee" />)
    expect(screen.getByRole('button', { name: 'Increase quantity of Tee' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity of Tee' }))
    expect(onChange).toHaveBeenCalledWith(9)
  })
})
