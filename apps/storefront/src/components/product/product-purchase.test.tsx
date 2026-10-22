import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { productDetail } from '@/test-utils/fixtures'
import { useCartStore } from '@/stores/cart-store'
import { useUiStore } from '@/stores/ui-store'
import { ProductPurchase } from './product-purchase'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function Harness(props: {
  product?: ReturnType<typeof productDetail>
  sticky?: boolean
  whatsapp?: string
}) {
  const product = props.product ?? productDetail()
  const [color, setColor] = useState<string | null>('White')
  return (
    <ProductPurchase
      product={product}
      color={color}
      onColorChange={setColor}
      sticky={props.sticky}
      whatsapp={props.whatsapp}
      pageUrl="https://nowoll.com/products/oxford-shirt"
    />
  )
}

describe('<ProductPurchase />', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
    push.mockClear()
  })

  it('38f: "Buy now" adds the chosen size to the bag and goes straight to checkout', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Buy now' })).toBeDisabled() // no size yet
    fireEvent.click(screen.getByRole('radio', { name: 'M' }))
    fireEvent.click(screen.getByRole('button', { name: 'Buy now' }))
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ variantId: 'w-m', quantity: 1 }),
    ])
    expect(push).toHaveBeenCalledWith('/checkout')
    // The bag panel stays shut — it would otherwise sit on top of the checkout page.
    expect(useUiStore.getState().cartOpen).toBe(false)
  })

  it('38f: "Ask on WhatsApp" opens a chat with the store, the product named in it', () => {
    const { unmount } = render(<Harness />)
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument() // no number set
    unmount()
    render(<Harness whatsapp="+8801712345678" />)
    const link = screen.getByRole('link', { name: 'Ask on WhatsApp' })
    expect(link).toHaveAttribute('target', '_blank')
    const href = new URL(link.getAttribute('href')!)
    expect(href.origin + href.pathname).toBe('https://wa.me/8801712345678')
    expect(href.searchParams.get('text')).toBe(
      'Hi! A question about Oxford Shirt — https://nowoll.com/products/oxford-shirt',
    )
  })

  it('asks for a size before adding; a sold-out size offers "Notify me" instead (38f)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: { waiting: true } }))),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Choose a size' })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: 'S (out of stock)' }))
    expect(screen.queryByRole('button', { name: /Add to bag|Out of stock/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email')
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }))
    expect(await screen.findByText(/we’ll email you once when/)).toHaveTextContent('S / White')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/stock-alerts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ variantId: 'w-s', email: 'fan@example.com' }),
      }),
    )

    // Back to an in-stock size: the normal Add to bag returns.
    fireEvent.click(screen.getByRole('radio', { name: 'M' }))
    expect(screen.getByRole('button', { name: 'Add to bag' })).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it('adds the chosen variant and quantity to the bag, and announces it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'M' }))
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to bag' }))

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({
        variantId: 'w-m',
        productSlug: 'oxford-shirt',
        variantLabel: 'M / White',
        sku: 'SKU-w-m',
        imageUrl: '/demo/white.webp', // the photo of that exact variant
        unitPrice: 1490,
        quantity: 2,
      }),
    ])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added 2 × Oxford Shirt (M / White) to your bag.',
    )
    expect(useUiStore.getState().cartOpen).toBe(true) // decision #4: the bag drawer opens
    expect(useUiStore.getState().justAdded).toMatchObject({ productName: expect.any(String) })
  })

  it("shows the selected variant's own price", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }))
    fireEvent.click(screen.getByRole('radio', { name: 'L' }))
    expect(screen.getByText('৳1,590')).toBeInTheDocument()
  })

  it('keeps the size when switching to a color that has it, clears it otherwise', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'M' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }))
    expect(screen.getByRole('radio', { name: 'M' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'L' }))
    fireEvent.click(screen.getByRole('radio', { name: 'White' }))
    expect(screen.getByRole('button', { name: 'Choose a size' })).toBeDisabled()
  })

  it('says "Sold out" when nothing at all is in stock', () => {
    const soldOut = productDetail({
      variants: productDetail().variants.map((v) => ({ ...v, inStock: false })),
    })
    render(<Harness product={soldOut} />)
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled()
  })

  it('adds a second Add button in the sticky phone bar on the product page', () => {
    render(<Harness sticky />)
    expect(screen.getAllByRole('button', { name: 'Choose a size' })).toHaveLength(2)
  })
})

describe('<ProductPurchase /> tracking (step 39a)', () => {
  it('"Add to bag" reports AddToCart with the variant SKU (once the customer agreed)', async () => {
    const { ACCEPT_ALL, CONSENT_STORAGE_KEY, serializeConsent } = await import('@nowoll/analytics')
    const { useTrackingStore } = await import('@/stores/tracking-store')
    const w = window as unknown as { fbq?: { queue?: unknown[] } }
    delete w.fbq
    useCartStore.getState().clear()
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    useTrackingStore
      .getState()
      .start({ ga4MeasurementId: '', gtmContainerId: '', metaPixelId: '123456789012' })

    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'M' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to bag' }))

    const queue = (): unknown[] =>
      (window as unknown as { fbq?: { queue?: unknown[] } }).fbq?.queue ?? []
    const calls = queue().map((a) => [...(a as IArguments)])
    expect(calls).toContainEqual([
      'track',
      'AddToCart',
      expect.objectContaining({
        content_ids: [useCartStore.getState().items[0]!.sku],
        content_type: 'product',
        currency: 'BDT',
      }),
      { eventID: expect.any(String) },
    ])
  })
})
