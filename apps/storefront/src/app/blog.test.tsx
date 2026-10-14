import { screen } from '@testing-library/react'
import { renderServer } from '@/test-utils/render-server'
import BlogPostPage, { generateMetadata } from './blog/[slug]/page'
import BlogPage from './blog/page'
import { sitemapEntries } from '@/lib/sitemap'

const responses = new Map<string, unknown>()
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn((path: string) => Promise.resolve(responses.get(path) ?? null)),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const POST = {
  slug: 'eid-looks',
  title: 'Eid looks',
  excerpt: 'Panjabis for Eid.',
  coverImageUrl: null,
  coverImageAlt: null,
  tags: ['eid'],
  publishedAt: '2026-10-10T06:00:00Z',
  updatedAt: '2026-10-11T06:00:00Z',
  content: '## Picks\n\n![Outside photo](https://evil.example/a.jpg#w=10&h=10)',
  seoTitle: null,
  seoDescription: null,
  products: [],
}

beforeEach(() => responses.clear())

describe('blog in the shop (step 43)', () => {
  it('a live post: title, date, tags, BlogPosting JSON-LD; outside photos show only their words', async () => {
    responses.set('/blog/eid-looks', POST)
    const { container } = await renderServer(
      <BlogPostPage params={Promise.resolve({ slug: 'eid-looks' })} />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Eid looks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'eid' })).toHaveAttribute('href', '/blog?tag=eid')
    expect(container.querySelector('article img')).toBeNull()
    expect(screen.getByText('Outside photo')).toBeInTheDocument()
    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.textContent ?? '{}'),
    )
    expect(ld.find((d) => d['@type'] === 'BlogPosting')).toMatchObject({
      headline: 'Eid looks',
      datePublished: POST.publishedAt,
      author: { '@type': 'Organization' },
    })
  })

  it('not live (null from the API) → 404; metadata says so', async () => {
    await expect(
      renderServer(<BlogPostPage params={Promise.resolve({ slug: 'nope' })} />),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'nope' }) })).toMatchObject({
      title: 'Post not found',
    })
  })

  it('the list: cards, or a friendly empty message', async () => {
    await renderServer(<BlogPage searchParams={Promise.resolve({})} />)
    expect(screen.getByText(/No posts yet/)).toBeInTheDocument()
  })

  it('sitemap: categories, products, live posts and pages', async () => {
    responses.set('/blog/sitemap', [{ slug: 'eid-looks', updatedAt: POST.updatedAt }])
    responses.set('/pages', [{ slug: 'privacy', title: 'Privacy' }])
    const urls = (await sitemapEntries()).map((e) => e.url)
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/blog$/),
        expect.stringMatching(/\/blog\/eid-looks$/),
        expect.stringMatching(/\/privacy$/),
      ]),
    )
  })
})
