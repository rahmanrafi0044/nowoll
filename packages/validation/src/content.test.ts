import { describe, expect, it } from 'vitest'
import {
  announcementBarSchema,
  DEFAULT_HOMEPAGE_LAYOUT,
  homepageHeroSchema,
  homepageLayoutSchema,
  readHomepageLayout,
  footerSchema,
  mainMenuSchema,
  imageUrlSchema,
  homepageSectionSchema,
} from './content.js'

describe('homepageHeroSchema', () => {
  const valid = { heading: 'always new', ctaLabel: 'Shop now', ctaHref: '/shop' }

  it('accepts a minimal hero and fills optional fields with null', () => {
    expect(homepageHeroSchema.parse(valid)).toEqual({
      ...valid,
      subheading: null,
      imageUrl: null,
      imageAlt: null,
      more: [], // 38f: a saved hero without extra slides stays valid
    })
  })

  it('38f: up to 3 more slides, each checked like the first', () => {
    const slide = { ...valid, imageUrl: '/perf/hero-2.jpg', imageAlt: 'Eid' }
    expect(homepageHeroSchema.parse({ ...valid, more: [slide] }).more).toHaveLength(1)
    expect(
      homepageHeroSchema.safeParse({ ...valid, more: [slide, slide, slide, slide] }).success,
    ).toBe(false)
    expect(
      homepageHeroSchema.safeParse({ ...valid, more: [{ ...slide, ctaHref: 'javascript:x' }] })
        .success,
    ).toBe(false)
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
      more: [], // 38f: saved announcements without extra messages stay valid
    })
  })

  it('38f: up to 3 more messages take turns — each checked like the first', () => {
    const msg = (text: string) => ({ text, href: null })
    expect(
      announcementBarSchema.parse({
        text: 'One',
        more: [msg('Two'), { text: 'Three', href: '/shop' }],
      }).more,
    ).toEqual([msg('Two'), { text: 'Three', href: '/shop' }])
    expect(
      announcementBarSchema.safeParse({
        text: 'One',
        more: [msg('2'), msg('3'), msg('4'), msg('5')],
      }).success,
    ).toBe(false)
    expect(announcementBarSchema.safeParse({ text: 'One', more: [msg(' ')] }).success).toBe(false)
    expect(
      announcementBarSchema.safeParse({
        text: 'One',
        more: [{ text: 'Two', href: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false)
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

describe('main menu and footer (step 38b)', () => {
  const cat = '0f8fad5b-d9cb-469f-a165-70867728950e'

  it('menu: shop all, categories by id (optional label), custom links', () => {
    const m = mainMenuSchema.parse({
      items: [
        { id: 'a', kind: 'shop_all' },
        { id: 'b', kind: 'category', categoryId: cat, label: ' Eid Panjabi ' },
        { id: 'c', kind: 'link', label: 'Sale', href: '/shop?tag=sale' },
      ],
    })
    expect(m.items).toEqual([
      { id: 'a', kind: 'shop_all', label: null },
      { id: 'b', kind: 'category', categoryId: cat, label: 'Eid Panjabi' },
      { id: 'c', kind: 'link', label: 'Sale', href: '/shop?tag=sale' },
    ])
  })

  it('menu refused: javascript: links, unknown kinds (no drop-downs / HTML), >12 items, same ids', () => {
    const bad = (items: unknown[]) => mainMenuSchema.safeParse({ items }).success
    expect(bad([{ id: 'a', kind: 'link', label: 'x', href: 'javascript:alert(1)' }])).toBe(false)
    expect(bad([{ id: 'a', kind: 'link', label: 'x', href: '//evil.example' }])).toBe(false)
    expect(bad([{ id: 'a', kind: 'dropdown', label: 'x', items: [] }])).toBe(false)
    expect(bad([{ id: 'a', kind: 'html', html: '<script>' }])).toBe(false)
    expect(bad([{ id: 'a', kind: 'category', categoryId: 'men' }])).toBe(false)
    expect(bad(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, kind: 'shop_all' })))).toBe(
      false,
    )
    expect(
      bad([
        { id: 'a', kind: 'shop_all' },
        { id: 'a', kind: 'shop_all' },
      ]),
    ).toBe(false)
  })

  it('footer: defaults are today’s footer; limits; payment badges from the fixed list', () => {
    expect(footerSchema.parse({})).toEqual({
      about: '',
      columns: [],
      autoPages: true,
      payments: [],
      copyright: '',
    })
    const ok = (f: object) => footerSchema.safeParse(f).success
    expect(ok({ payments: ['cod', 'bkash', 'visa'] })).toBe(true)
    expect(ok({ payments: ['paypal'] })).toBe(false)
    expect(ok({ payments: ['cod', 'cod'] })).toBe(false)
    expect(ok({ about: 'x'.repeat(301) })).toBe(false)
    expect(ok({ columns: [{ id: 'c', title: 'Help', links: [] }] })).toBe(false)
    const col = (i: number) => ({
      id: `c${i}`,
      title: 'Help',
      links: [{ label: 'FAQ', href: '/faq' }],
    })
    expect(ok({ columns: [col(1), col(2), col(3)] })).toBe(true)
    expect(ok({ columns: [col(1), col(2), col(3), col(4)] })).toBe(false)
    expect(
      ok({ columns: [{ id: 'c', title: 'Help', links: [{ label: 'x', href: 'javascript:x' }] }] }),
    ).toBe(false)
  })
})

describe('imageUrlSchema (38f)', () => {
  it('accepts an uploaded https photo or a file on this shop', () => {
    expect(
      imageUrlSchema.parse('https://x.supabase.co/storage/v1/object/public/content/a.webp'),
    ).toBe('https://x.supabase.co/storage/v1/object/public/content/a.webp')
    expect(imageUrlSchema.parse('/perf/hero.jpg')).toBe('/perf/hero.jpg')
  })

  it('refuses anything that could lead elsewhere or run code', () => {
    for (const bad of [
      'http://x.example/a.jpg',
      '//evil.example/a.jpg',
      '/\\evil.example/a.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'a.jpg',
      '',
    ])
      expect(imageUrlSchema.safeParse(bad).success, bad).toBe(false)
  })
})

describe('38f homepage sections: split, circles, story', () => {
  const photo = { imageUrl: '/perf/a.jpg', imageAlt: 'A model in lawn' }
  const parse = (section: object) =>
    homepageSectionSchema.safeParse({ id: 's1', visible: true, ...section })

  it('split: a photo and words, image on the left unless told otherwise', () => {
    const r = parse({ type: 'split', ...photo, heading: 'Made in Dhaka' })
    expect(r.success && r.data).toMatchObject({ imageSide: 'left', text: null, href: null })
    expect(parse({ type: 'split', ...photo, heading: '' }).success).toBe(false)
    expect(parse({ type: 'split', ...photo, heading: 'X', imageSide: 'top' }).success).toBe(false)
  })

  it('circles: 2 to 6, each with a photo, a label and a safe link', () => {
    const item = { ...photo, label: 'Eid', href: '/shop/eid' }
    expect(parse({ type: 'circles', items: [item, item] }).success).toBe(true)
    expect(parse({ type: 'circles', items: [item] }).success).toBe(false)
    expect(parse({ type: 'circles', items: Array(7).fill(item) }).success).toBe(false)
    expect(
      parse({ type: 'circles', items: [item, { ...item, href: '//evil.example' }] }).success,
    ).toBe(false)
  })

  it('story: words required, the photo optional', () => {
    expect(parse({ type: 'story', heading: 'Always new', text: 'Since 2026.' }).success).toBe(true)
    expect(parse({ type: 'story', heading: 'Always new', text: '' }).success).toBe(false)
    expect(
      parse({ type: 'story', heading: 'X', text: 'Y', imageUrl: 'http://x.example/a.jpg' }).success,
    ).toBe(false)
  })
})
