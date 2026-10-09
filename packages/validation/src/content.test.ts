import { describe, expect, it } from 'vitest'
import {
  announcementBarSchema,
  DEFAULT_HOMEPAGE_LAYOUT,
  homepageHeroSchema,
  homepageLayoutSchema,
  readHomepageLayout,
} from './content.js'

describe('homepageHeroSchema', () => {
  const valid = { heading: 'always new', ctaLabel: 'Shop now', ctaHref: '/shop' }

  it('accepts a minimal hero and fills optional fields with null', () => {
    expect(homepageHeroSchema.parse(valid)).toEqual({
      ...valid,
      subheading: null,
      imageUrl: null,
      imageAlt: null,
    })
  })

  it.each([
    ['javascript: link', 'javascript:alert(1)'],
    ['protocol-relative link', '//evil.example'],
    ['plain http link', 'http://example.com'],
    ['relative without slash', 'shop'],
  ])('rejects an unsafe button link: %s', (_label, ctaHref) => {
    expect(homepageHeroSchema.safeParse({ ...valid, ctaHref }).success).toBe(false)
  })

  it('accepts https links and requires an https image', () => {
    expect(
      homepageHeroSchema.safeParse({ ...valid, ctaHref: 'https://nowoll.com/sale' }).success,
    ).toBe(true)
    expect(homepageHeroSchema.safeParse({ ...valid, imageUrl: 'http://x.com/a.jpg' }).success).toBe(
      false,
    )
  })
})

describe('announcementBarSchema', () => {
  it('accepts text with an optional link', () => {
    expect(announcementBarSchema.parse({ text: 'Free delivery in Dhaka' })).toEqual({
      text: 'Free delivery in Dhaka',
      href: null,
    })
  })

  it('rejects empty or very long text', () => {
    expect(announcementBarSchema.safeParse({ text: ' ' }).success).toBe(false)
    expect(announcementBarSchema.safeParse({ text: 'x'.repeat(121) }).success).toBe(false)
  })
})

describe('homepage layout (step 36)', () => {
  const products = {
    id: 'eid',
    type: 'products',
    title: 'Eid collection',
    source: { kind: 'tag', tag: 'eid' },
  }
  const banners = {
    id: 'promo',
    type: 'banners',
    banners: [{ imageUrl: 'https://x.supabase.co/a.jpg', imageAlt: 'Sale banner', href: '/shop' }],
  }

  it('accepts every section type and fills defaults (visible, limit 8, nulls)', () => {
    const parsed = homepageLayoutSchema.parse({
      sections: [
        { id: 'hero', type: 'hero' },
        products,
        banners,
        {
          id: 'badges',
          type: 'trust_badges',
          badges: [{ icon: 'truck', text: 'Nationwide delivery' }],
        },
        { id: 'news', type: 'newsletter', visible: false },
      ],
    })
    expect(parsed.sections[0]).toEqual({ id: 'hero', type: 'hero', visible: true })
    expect(parsed.sections[1]).toMatchObject({ visible: true, limit: 8 })
    expect(parsed.sections[2]).toMatchObject({ banners: [{ text: null, href: '/shop' }] })
    expect(parsed.sections[4]).toMatchObject({ visible: false })
  })

  it.each([
    [
      'an unsafe banner link',
      { ...banners, banners: [{ ...banners.banners[0], href: 'javascript:alert(1)' }] },
    ],
    [
      'an http (not https) banner picture',
      { ...banners, banners: [{ ...banners.banners[0], imageUrl: 'http://x.com/a.jpg' }] },
    ],
    [
      'a banner without alt text',
      { ...banners, banners: [{ ...banners.banners[0], imageAlt: ' ' }] },
    ],
    ['four banners', { ...banners, banners: Array(4).fill(banners.banners[0]) }],
    [
      'an icon outside the fixed set',
      { id: 'b', type: 'trust_badges', badges: [{ icon: 'skull', text: 'x' }] },
    ],
    ['a product row of 20', { ...products, limit: 20 }],
    [
      'a category address with spaces',
      { ...products, source: { kind: 'category', slug: 'Men Shirts' } },
    ],
    ['an unknown section type', { id: 'x', type: 'html', html: '<script>' }],
  ])('refuses %s', (_label, section) => {
    expect(homepageLayoutSchema.safeParse({ sections: [section] }).success).toBe(false)
  })

  it('section ids must be unique', () => {
    const twice = {
      sections: [
        { id: 'a', type: 'hero' },
        { id: 'a', type: 'newsletter' },
      ],
    }
    expect(homepageLayoutSchema.safeParse(twice).success).toBe(false)
  })

  it('readHomepageLayout: a broken section hides only itself; garbage → today’s homepage', () => {
    expect(
      readHomepageLayout({
        sections: [{ id: 'hero', type: 'hero' }, { id: 'x', type: 'html' }, products],
      }).sections.map((s) => s.id),
    ).toEqual(['hero', 'eid'])
    expect(readHomepageLayout(null)).toEqual(DEFAULT_HOMEPAGE_LAYOUT)
    expect(readHomepageLayout({ sections: 'nope' })).toEqual(DEFAULT_HOMEPAGE_LAYOUT)
    expect(readHomepageLayout({ sections: [] })).toEqual({ sections: [] }) // an empty page is allowed
  })

  it('the default layout is valid and matches today’s homepage order', () => {
    expect(homepageLayoutSchema.safeParse(DEFAULT_HOMEPAGE_LAYOUT).success).toBe(true)
    expect(DEFAULT_HOMEPAGE_LAYOUT.sections.map((s) => s.type)).toEqual([
      'hero',
      'categories',
      'featured',
      'new_arrivals',
      'newsletter',
    ])
  })
})
