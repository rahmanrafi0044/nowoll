import { describe, expect, it } from 'vitest'
import { announcementBarSchema, homepageHeroSchema } from './content.js'

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
