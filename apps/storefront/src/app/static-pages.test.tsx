import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RESERVED_PAGE_SLUGS } from '@nowoll/validation'
import { render, screen, within } from '@testing-library/react'
import { SiteFooter } from '@/components/site-footer'
import { renderServer } from '@/test-utils/render-server'
import StaticPage, { generateMetadata, generateStaticParams } from './[pageSlug]/page'

// A fake API: each test sets what each path returns (anything unset → null).
const responses = new Map<string, unknown>()
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn((path: string) => Promise.resolve(responses.get(path) ?? null)),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const RETURNS = {
  slug: 'return-policy',
  title: 'Return policy',
  content:
    '## How long you have\n\nWithin **7 days** of delivery. See [Track your order](/orders/track).\n\n<script>alert(1)</script>',
  seoTitle: null,
  seoDescription: null,
  updatedAt: '2026-10-09T10:00:00Z',
}
const params = (pageSlug: string) => ({ params: Promise.resolve({ pageSlug }) })

beforeEach(() => responses.clear())

describe('static pages (step 36 part 2)', () => {
  it('a published page: its title, its Markdown as text (never HTML), its links', async () => {
    responses.set('/pages/return-policy', RETURNS)
    const { container } = await renderServer(<StaticPage {...params('return-policy')} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Return policy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'How long you have' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('7 days')
    expect(screen.getByRole('link', { name: 'Track your order' })).toHaveAttribute(
      'href',
      '/orders/track',
    )
    expect(container.querySelector('article script:not([type="application/ld+json"])')).toBeNull()
  })

  it('draft, archived or unknown → "page not found"', async () => {
    await expect(StaticPage(params('privacy'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(await generateMetadata(params('privacy'))).toEqual({ title: 'Page not found' })
  })

  it('Google: the admin’s title/description, else the title and the first words; canonical address', async () => {
    responses.set('/pages/return-policy', RETURNS)
    expect(await generateMetadata(params('return-policy'))).toEqual({
      title: 'Return policy',
      description: 'How long you have Within 7 days of delivery. See Track your order. alert(1)',
      alternates: { canonical: '/return-policy' },
    })
    responses.set('/pages/return-policy', {
      ...RETURNS,
      seoTitle: 'Returns | Nowoll',
      seoDescription: 'Return within 7 days.',
    })
    expect(await generateMetadata(params('return-policy'))).toMatchObject({
      title: 'Returns | Nowoll',
      description: 'Return within 7 days.',
    })
    responses.set('/pages/return-policy', { ...RETURNS, content: 'word '.repeat(80) })
    const long = (await generateMetadata(params('return-policy'))).description as string
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('…')).toBe(true)
  })

  it('built ahead of time: every published page (none when the API is down)', async () => {
    expect(await generateStaticParams()).toEqual([])
    responses.set('/pages', [
      { slug: 'privacy', title: 'Privacy policy' },
      { slug: 'faq', title: 'FAQ' },
    ])
    expect(await generateStaticParams()).toEqual([{ pageSlug: 'privacy' }, { pageSlug: 'faq' }])
  })

  it('a page can never hide a shop route: every top-level route folder is a reserved address', () => {
    const routes = readdirSync(join(__dirname), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('[') && !d.name.startsWith('('))
      .map((d) => d.name)
    expect(routes.length).toBeGreaterThan(5)
    for (const r of routes) expect(RESERVED_PAGE_SLUGS).toContain(r)
  })
})

describe('footer', () => {
  it('order tracking + only the published pages, in order', () => {
    render(
      <SiteFooter
        pages={[
          { slug: 'privacy', title: 'Privacy policy' },
          { slug: 'faq', title: 'FAQ' },
        ]}
      />,
    )
    const nav = within(screen.getByRole('navigation', { name: 'Footer' }))
    expect(nav.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Track your order', '/orders/track'],
      ['Privacy policy', '/privacy'],
      ['FAQ', '/faq'],
    ])
  })
})
