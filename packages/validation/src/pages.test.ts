import { describe, expect, it } from 'vitest'
import { pageInputSchema, pageSlugSchema, RESERVED_PAGE_SLUGS, safeMarkdownHref } from './pages.js'

describe('pages', () => {
  const ok = { title: 'Return policy', slug: 'return-policy', content: '# Returns' }

  it('a page: trimmed, empty SEO fields become null', () => {
    expect(
      pageInputSchema.parse({
        ...ok,
        title: '  Return policy ',
        seoTitle: '',
        seoDescription: ' ',
      }),
    ).toEqual({ ...ok, seoTitle: null, seoDescription: null })
  })

  it('addresses the shop already uses are refused (a page must never hide the cart)', () => {
    for (const s of RESERVED_PAGE_SLUGS) expect(pageSlugSchema.safeParse(s).success).toBe(false)
    expect(pageSlugSchema.safeParse('privacy').success).toBe(true)
    expect(pageSlugSchema.safeParse('Privacy Policy').success).toBe(false)
    expect(pageSlugSchema.safeParse('a'.repeat(61)).success).toBe(false)
  })

  it('limits: title, content, Google title and description', () => {
    expect(pageInputSchema.safeParse({ ...ok, title: '' }).success).toBe(false)
    expect(pageInputSchema.safeParse({ ...ok, title: 'x'.repeat(81) }).success).toBe(false)
    expect(pageInputSchema.safeParse({ ...ok, content: 'x'.repeat(30_001) }).success).toBe(false)
    expect(pageInputSchema.safeParse({ ...ok, seoTitle: 'x'.repeat(71) }).success).toBe(false)
    expect(pageInputSchema.safeParse({ ...ok, seoDescription: 'x'.repeat(161) }).success).toBe(
      false,
    )
  })

  it('links in the text: shop paths, https, email, phone and #anchors kept; anything else dropped', () => {
    for (const h of [
      '/shop/men',
      'https://wa.me/8801700000000',
      'mailto:hi@nowoll.com',
      'tel:+8801700000000',
      '#returns',
    ])
      expect(safeMarkdownHref(h)).toBe(h)
    for (const h of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,x',
      'http://x.com',
      '//evil.com',
      'vbscript:x',
    ])
      expect(safeMarkdownHref(h)).toBeNull()
  })
})
