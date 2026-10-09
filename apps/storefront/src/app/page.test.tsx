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

  describe('the homepage builder (step 36)', () => {
    const layout = (sections: unknown[]) =>
      responses.set('/content-blocks/homepage_layout', {
        key: 'homepage_layout',
        data: { sections },
      })
    const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

    it('nothing saved → exactly the homepage from before (default order)', async () => {
      responses.set('/categories', [{ id: '1', name: 'Men', slug: 'men', children: [] }])
      responses.set('/products?featured=true&pageSize=8', page([product('Oxford Shirt')]))
      responses.set('/products?sort=newest&pageSize=8', page([product('Linen Shirt')]))
      render(await HomePage())
      expect(headings()).toEqual([
        'Shop by category',
        'Featured',
        'New arrivals',
        expect.stringMatching(/Be first/),
      ])
    })

    it('follows the saved order, hides hidden sections, uses renamed titles', async () => {
      layout([
        { id: 'news', type: 'newsletter', visible: true },
        { id: 'new-arrivals', type: 'new_arrivals', visible: true, title: 'Just in' },
        { id: 'featured', type: 'featured', visible: false, title: null },
        { id: 'cats', type: 'categories', visible: true, title: 'Browse' },
      ])
      responses.set('/categories', [{ id: '1', name: 'Men', slug: 'men', children: [] }])
      responses.set('/products?featured=true&pageSize=8', page([product('Oxford Shirt')]))
      responses.set('/products?sort=newest&pageSize=8', page([product('Linen Shirt')]))
      render(await HomePage())
      expect(headings()).toEqual([expect.stringMatching(/Be first/), 'Just in', 'Browse'])
      expect(screen.queryByRole('link', { name: 'Oxford Shirt' })).not.toBeInTheDocument()
    })

    it('product rows by tag and by category — each with the right "View all" link', async () => {
      layout([
        {
          id: 'eid',
          type: 'products',
          visible: true,
          title: 'Eid collection',
          source: { kind: 'tag', tag: 'eid sale' },
          limit: 4,
        },
        {
          id: 'men',
          type: 'products',
          visible: true,
          title: 'For him',
          source: { kind: 'category', slug: 'men' },
          limit: 8,
        },
      ])
      responses.set('/products?tag=eid%20sale&pageSize=4', page([product('Silk Panjabi')]))
      responses.set('/products?category=men&pageSize=8', page([product('Chino')]))
      render(await HomePage())
      expect(screen.getByRole('link', { name: 'Silk Panjabi' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View all eid collection' })).toHaveAttribute(
        'href',
        '/shop?tag=eid%20sale',
      )
      expect(screen.getByRole('link', { name: 'View all for him' })).toHaveAttribute(
        'href',
        '/shop/men',
      )
    })

    it('promo banners (picture + text + link) and trust badges (text, icons hidden from screen readers)', async () => {
      layout([
        {
          id: 'promo',
          type: 'banners',
          visible: true,
          banners: [
            {
              imageUrl: 'https://x.supabase.co/a.jpg',
              imageAlt: 'Eid sale banner',
              text: 'Up to 30% off',
              href: '/shop?tag=eid',
            },
            {
              imageUrl: 'https://x.supabase.co/b.jpg',
              imageAlt: 'New linen shirts',
              text: null,
              href: null,
            },
          ],
        },
        {
          id: 'badges',
          type: 'trust_badges',
          visible: true,
          badges: [
            { icon: 'cash', text: 'Cash on delivery' },
            { icon: 'return', text: '7-day returns' },
          ],
        },
      ])
      const { container } = render(await HomePage())
      const promos = screen.getByRole('region', { name: 'Promotions' })
      expect(promos.querySelector('a')).toHaveAttribute('href', '/shop?tag=eid')
      expect(screen.getByRole('img', { name: 'Eid sale banner' })).toBeInTheDocument()
      expect(promos).toHaveTextContent('Up to 30% off')
      expect(promos.querySelectorAll('a')).toHaveLength(1) // the second banner has no link
      const badges = screen.getByRole('region', { name: 'Why shop with us' })
      expect(badges).toHaveTextContent('Cash on delivery')
      expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
    })

    it('an empty saved layout → an empty page (only what the admin chose)', async () => {
      layout([])
      render(await HomePage())
      expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([])
    })
  })

  it('includes Organization structured data with "<" escaped', async () => {
    const { container } = render(await HomePage())
    const script = container.querySelector('script[type="application/ld+json"]')!
    expect(JSON.parse(script.innerHTML)).toMatchObject({ '@type': 'Organization', name: 'Nowoll' })
  })
})
