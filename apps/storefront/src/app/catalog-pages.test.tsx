import { screen } from '@testing-library/react'
import { renderServer } from '@/test-utils/render-server'
import { productDetail } from '@/test-utils/fixtures'
import CategoryPage, { generateMetadata as categoryMetadata } from './shop/[categorySlug]/page'
import ShopPage, { generateMetadata as shopMetadata } from './shop/page'
import ProductPage, {
  generateMetadata as productMetadata,
  generateStaticParams,
} from './products/[productSlug]/page'

// A fake API: each test sets what each path returns (anything unset → null, like a 404).
const responses = new Map<string, unknown>()
const requested: string[] = []
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn((path: string) => {
    requested.push(path)
    return Promise.resolve(responses.get(path) ?? null)
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn() }),
}))

const card = (name: string, slug = name.toLowerCase().replace(/\s/g, '-')) => ({
  id: slug,
  name,
  slug,
  shortDescription: null,
  basePrice: '1000',
  compareAtPrice: null,
  isFeatured: false,
  category: { name: 'Men', slug: 'men' },
  image: null,
  colors: [],
  sizes: ['M'],
  inStock: true,
})
const page = (items: unknown[], extra: object = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 24,
  totalPages: 1,
  ...extra,
})
const facets = {
  sizes: ['S', 'M'],
  colors: [{ color: 'Blue', colorHex: '#00F' }],
  price: { min: '500', max: '3000' },
}
const sp = (o: Record<string, string> = {}) => Promise.resolve(o)

beforeEach(() => {
  responses.clear()
  requested.length = 0
})

describe('/shop', () => {
  it('lists products with filters, chips and sort, sending the right API query', async () => {
    responses.set(
      '/products?size=M&sort=price_asc&page=1&pageSize=24',
      page([card('Oxford Shirt')]),
    )
    responses.set('/products/facets', facets)
    await renderServer(ShopPage({ searchParams: sp({ size: 'M', sort: 'price_asc' }) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Shop all' })).toBeInTheDocument()
    expect(screen.getByText('1 product')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Oxford Shirt' })).toHaveAttribute(
      'href',
      '/products/oxford-shirt',
    )
    expect(screen.getByRole('link', { name: /Size: M/ })).toHaveAttribute(
      'href',
      '/shop?sort=price_asc',
    )
    expect(screen.getAllByRole('combobox', { name: 'Sort by' })[0]).toHaveValue('price_asc')
    expect(screen.getAllByRole('button', { name: /Quick view/ })).toHaveLength(1)
  })

  it('shows a helpful empty state with a way to clear filters', async () => {
    responses.set('/products/facets', facets)
    await renderServer(ShopPage({ searchParams: sp({ color: 'Purple' }) }))
    expect(screen.getByText('No products match')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute('href', '/shop')
  })

  it('canonical drops filters but keeps the page; search results are not indexed', async () => {
    expect(await shopMetadata({ searchParams: sp({ size: 'M', page: '2' }) })).toMatchObject({
      alternates: { canonical: '/shop?page=2' },
    })
    expect(await shopMetadata({ searchParams: sp({ q: 'shirt' }) })).toMatchObject({
      title: 'Search: shirt',
      robots: { index: false, follow: true },
    })
  })

  it('pagination links keep the filters', async () => {
    responses.set(
      '/products?size=M&page=2&pageSize=24',
      page([card('A')], { page: 2, totalPages: 3, total: 50 }),
    )
    await renderServer(ShopPage({ searchParams: sp({ size: 'M', page: '2' }) }))
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/shop?size=M&page=3',
    )
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/shop?size=M',
    )
  })
})

describe('/shop/[categorySlug]', () => {
  const men = {
    id: 'c1',
    name: 'Men',
    slug: 'men',
    description: 'For him',
    imageUrl: null,
    imageAlt: null,
    seoTitle: 'Men’s clothing',
    seoDescription: null,
    sizeGuide: null,
    breadcrumb: [],
    children: [
      {
        id: 'c2',
        name: 'Shirts',
        slug: 'men-shirts',
        description: null,
        imageUrl: null,
        imageAlt: null,
        seoTitle: null,
        seoDescription: null,
      },
    ],
  }

  it('shows the category with its subcategories and breadcrumb data', async () => {
    responses.set('/categories/men', men)
    responses.set('/products?category=men&page=1&pageSize=24', page([card('Oxford Shirt')]))
    const { container } = await renderServer(
      CategoryPage({ params: Promise.resolve({ categorySlug: 'men' }), searchParams: sp() }),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Men' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shirts' })).toHaveAttribute('href', '/shop/men-shirts')
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.innerHTML)
    expect(ld['@type']).toBe('BreadcrumbList')
    expect(requested).toContain('/products/facets?category=men')
  })

  it('404s for unknown or hidden categories', async () => {
    await expect(
      CategoryPage({ params: Promise.resolve({ categorySlug: 'nope' }), searchParams: sp() }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('uses the SEO title and a filter-free canonical', async () => {
    responses.set('/categories/men', men)
    expect(
      await categoryMetadata({
        params: Promise.resolve({ categorySlug: 'men' }),
        searchParams: sp({ color: 'Blue' }),
      }),
    ).toMatchObject({
      title: 'Men’s clothing',
      alternates: { canonical: '/shop/men' },
    })
  })
})

describe('/products/[productSlug]', () => {
  it('renders the product with purchase panel, details, size guide and structured data', async () => {
    responses.set('/products/oxford-shirt', productDetail())
    responses.set('/categories/shirts', { sizeGuide: 'S = 38"\nM = 40"' })
    const { container } = await renderServer(
      ProductPage({ params: Promise.resolve({ productSlug: 'oxford-shirt' }) }),
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Oxford Shirt' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Choose a size' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Size guide' })).toHaveAttribute('href', '#size-guide')
    expect(screen.getByRole('heading', { name: 'Size guide' })).toBeInTheDocument()

    const lds = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.innerHTML),
    )
    const product = lds.find((l) => l['@type'] === 'Product')
    expect(product.offers).toMatchObject({
      priceCurrency: 'BDT',
      lowPrice: 1490,
      highPrice: 1590,
      availability: 'https://schema.org/InStock',
    })
    expect(product.image[0]).toBe('http://localhost:3000/demo/white.webp')
    expect(lds.find((l) => l['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(4)
  })

  it('escapes "<" in structured data so a product name cannot break out of the script tag', async () => {
    responses.set('/products/x', productDetail({ name: '</script><script>alert(1)</script>' }))
    const { container } = await renderServer(
      ProductPage({ params: Promise.resolve({ productSlug: 'x' }) }),
    )
    const raw = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.innerHTML)
      .join('')
    expect(raw).not.toContain('</script>')
    expect(raw).toContain('\\u003c/script>')
  })

  it('404s for unknown products and builds metadata from the product', async () => {
    await expect(ProductPage({ params: Promise.resolve({ productSlug: 'nope' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    responses.set('/products/oxford-shirt', productDetail())
    expect(
      await productMetadata({ params: Promise.resolve({ productSlug: 'oxford-shirt' }) }),
    ).toMatchObject({
      title: 'Oxford Shirt',
      alternates: { canonical: '/products/oxford-shirt' },
      openGraph: { images: [{ url: 'http://localhost:3000/demo/white.webp' }] },
    })
  })

  it('generateStaticParams lists every product across pages, and copes with the API being down', async () => {
    responses.set('/products?pageSize=60&page=1', page([card('A')], { totalPages: 2 }))
    responses.set('/products?pageSize=60&page=2', page([card('B')], { page: 2, totalPages: 2 }))
    expect(await generateStaticParams()).toEqual([{ productSlug: 'a' }, { productSlug: 'b' }])
    responses.clear()
    expect(await generateStaticParams()).toEqual([])
  })
})
