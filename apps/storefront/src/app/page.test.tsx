import { render, screen } from '@testing-library/react'
import HomePage from './page'

// Replace the API helper: each test decides what the API "returns".
const responses = new Map<string, unknown>()
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn((path: string) => Promise.resolve(responses.get(path) ?? null)),
}))

const product = (name: string) => ({
  id: name,
  name,
  slug: name.toLowerCase().replace(/\s/g, '-'),
  shortDescription: null,
  basePrice: '1000',
  compareAtPrice: null,
  isFeatured: true,
  category: { name: 'Men', slug: 'men' },
  image: null,
  colors: [],
  sizes: [],
  inStock: true,
})
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 8,
  totalPages: 1,
})

describe('homepage', () => {
  beforeEach(() => responses.clear())

  it('shows every section when the API has data', async () => {
    responses.set('/content-blocks/homepage_hero', {
      key: 'homepage_hero',
      data: {
        heading: 'always new',
        subheading: null,
        ctaLabel: 'Shop now',
        ctaHref: '/shop',
        imageUrl: null,
        imageAlt: null,
      },
    })
    responses.set('/categories', [
      {
        id: '1',
        name: 'Men',
        slug: 'men',
        description: null,
        imageUrl: null,
        imageAlt: null,
        seoTitle: null,
        seoDescription: null,
        children: [],
      },
    ])
    responses.set('/products?featured=true&pageSize=8', page([product('Oxford Shirt')]))
    responses.set('/products?sort=newest&pageSize=8', page([product('Linen Shirt')]))

    render(await HomePage())
    expect(screen.getByRole('heading', { level: 1, name: 'always new' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shop by category' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Featured' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Linen Shirt' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Be first/ })).toBeInTheDocument()
  })

  it('still renders (with just the newsletter) when the API is down', async () => {
    render(await HomePage())
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Be first/ })).toBeInTheDocument()
  })

  it('includes Organization structured data with "<" escaped', async () => {
    const { container } = render(await HomePage())
    const script = container.querySelector('script[type="application/ld+json"]')!
    expect(JSON.parse(script.innerHTML)).toMatchObject({ '@type': 'Organization', name: 'Nowoll' })
  })
})
