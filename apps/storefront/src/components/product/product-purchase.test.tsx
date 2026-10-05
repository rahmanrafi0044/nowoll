import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { productDetail } from '@/test-utils/fixtures'
import { useCartStore } from '@/stores/cart-store'
import { ProductPurchase } from './product-purchase'

function Harness(props: { product?: ReturnType<typeof productDetail>; sticky?: boolean }) {
  const product = props.product ?? productDetail()
  const [color, setColor] = useState<string | null>('White')
  return (
    <ProductPurchase
      product={product}
      color={color}
      onColorChange={setColor}
      sticky={props.sticky}
    />
  )
}

describe('<ProductPurchase />', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('asks for a size before adding, and disables out-of-stock sizes', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Choose a size' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /S \(out of stock\)/ })).toBeDisabled()
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
