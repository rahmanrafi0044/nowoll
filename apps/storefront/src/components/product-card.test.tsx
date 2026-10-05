import type { ProductCardView } from '@nowoll/types'
import { render, screen } from '@testing-library/react'
import { ProductCard } from './product-card'

const base: ProductCardView = {
  id: 'p1',
  name: 'Linen Casual Shirt',
  slug: 'linen-casual-shirt',
  shortDescription: null,
  basePrice: '1890',
  compareAtPrice: null,
  isFeatured: false,
  category: { name: 'Shirts', slug: 'shirts' },
  image: { id: 'i1', url: '/demo/linen.webp', altText: 'Linen shirt in beige', variantId: null },
  colors: [
    { color: 'Beige', colorHex: '#D8C8A8' },
    { color: 'Olive', colorHex: '#6B7A4B' },
  ],
  sizes: ['M', 'L'],
  inStock: true,
}

describe('<ProductCard />', () => {
  it('links the name to the product page and shows the photo with its alt text', () => {
    render(<ProductCard product={base} />)
    expect(screen.getByRole('link', { name: 'Linen Casual Shirt' })).toHaveAttribute(
      'href',
      '/products/linen-casual-shirt',
    )
    expect(screen.getByRole('img', { name: 'Linen shirt in beige' })).toBeInTheDocument()
    expect(screen.getByText('৳1,890')).toBeInTheDocument()
  })

  it('shows the old price crossed out and a discount badge when on sale', () => {
    render(<ProductCard product={{ ...base, compareAtPrice: '2290' }} />)
    expect(screen.getByText('-17%')).toBeInTheDocument()
    expect(screen.getByText('৳2,290').closest('s')).toBeInTheDocument()
  })

  it('shows "Sold out" (and no sale badge) when nothing is in stock', () => {
    render(<ProductCard product={{ ...base, inStock: false, compareAtPrice: '2290' }} />)
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    expect(screen.queryByText('-17%')).not.toBeInTheDocument()
  })

  it('lists color swatches with names for screen readers, capped at 5', () => {
    const colors = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({
      color: c,
      colorHex: '#000000',
    }))
    render(<ProductCard product={{ ...base, colors }} />)
    expect(screen.getByRole('list', { name: '7 colors' })).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('F')).not.toBeInTheDocument()
  })

  it('shows a placeholder when there is no photo', () => {
    render(<ProductCard product={{ ...base, image: null }} />)
    expect(screen.getByText('No photo')).toBeInTheDocument()
  })
})
