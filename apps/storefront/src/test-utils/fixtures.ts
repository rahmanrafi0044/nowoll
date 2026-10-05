import type { ProductDetailView, ProductVariantView } from '@nowoll/types'

export const variant = (
  id: string,
  color: string,
  size: string,
  inStock = true,
  price = '1490',
): ProductVariantView => ({
  id,
  sku: `SKU-${id}`,
  size,
  color,
  colorHex: color === 'Blue' ? '#0000FF' : '#FFFFFF',
  price,
  compareAtPrice: null,
  inStock,
})

export const productDetail = (overrides: Partial<ProductDetailView> = {}): ProductDetailView => ({
  id: 'p1',
  name: 'Oxford Shirt',
  slug: 'oxford-shirt',
  shortDescription: 'Crisp cotton',
  basePrice: '1490',
  compareAtPrice: null,
  isFeatured: false,
  category: { name: 'Shirts', slug: 'shirts' },
  description: 'Line one\nLine two',
  tags: [],
  seoTitle: null,
  seoDescription: null,
  inStock: true,
  breadcrumb: [
    { id: 'c1', name: 'Men', slug: 'men' },
    { id: 'c2', name: 'Shirts', slug: 'shirts' },
  ],
  images: [
    { id: 'i1', url: '/demo/white.webp', altText: 'Shirt in white', variantId: 'w-m' },
    { id: 'i2', url: '/demo/blue.webp', altText: 'Shirt in blue', variantId: 'b-m' },
  ],
  variants: [
    variant('w-s', 'White', 'S', false),
    variant('w-m', 'White', 'M'),
    variant('b-m', 'Blue', 'M'),
    variant('b-l', 'Blue', 'L', true, '1590'),
  ],
  ...overrides,
})
