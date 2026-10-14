import { describe, expect, it } from 'vitest'
import {
  blogInputSchema,
  blogPhotoProblem,
  blogPhotoSize,
  isBlogPostLive,
  markdownPhotoSources,
} from './blog.js'

const OWN = 'https://x.supabase.co/storage/v1/object/public/product-images/content/'
const base = { title: 'Eid looks', slug: 'eid-looks', content: 'Hello' }
const parse = (patch: object) => blogInputSchema.safeParse({ ...base, ...patch })

describe('blog post rules (step 43)', () => {
  it('cleans and defaults: empty texts → null, tags lowercased once each', () => {
    expect(parse({ excerpt: '  ', tags: ['Eid', 'eid', 'summer-2026'] }).data).toMatchObject({
      excerpt: null,
      tags: ['eid', 'summer-2026'],
      productIds: [],
      coverImageUrl: null,
    })
  })

  it('refuses bad addresses, too many tags or products, the same product twice', () => {
    expect(parse({ slug: 'Eid Looks!' }).success).toBe(false)
    expect(parse({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false)
    expect(parse({ tags: ['<b>'] }).success).toBe(false)
    const id = '6f1e2c3a-1b2c-4d5e-8f90-123456789abc'
    expect(parse({ productIds: [id, id] }).success).toBe(false)
    expect(
      parse({
        productIds: Array.from({ length: 5 }, (_, i) => `6f1e2c3a-1b2c-4d5e-8f90-12345678900${i}`),
      }).success,
    ).toBe(false)
    expect(parse({ productIds: ['not-an-id'] }).success).toBe(false)
  })

  it('a cover photo needs a description (screen readers)', () => {
    const r = parse({ coverImageUrl: `${OWN}a.jpg` })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]).toMatchObject({ path: ['coverImageAlt'] })
    expect(parse({ coverImageUrl: `${OWN}a.jpg`, coverImageAlt: 'Two panjabis' }).success).toBe(
      true,
    )
  })
})

describe('photos inside a post', () => {
  it('the editor adds the size after # — read back exactly', () => {
    expect(blogPhotoSize(`${OWN}a.jpg#w=1200&h=800`)).toEqual({
      url: `${OWN}a.jpg`,
      width: 1200,
      height: 800,
    })
    expect(blogPhotoSize(`${OWN}a.jpg`)).toBeNull()
    expect(blogPhotoSize(`${OWN}a.jpg#w=0&h=800`)).toBeNull()
    expect(blogPhotoSize(`http://evil.com/a.jpg#w=1&h=1`)).toBeNull()
  })

  it('finds every photo in the Markdown (with or without a title)', () => {
    expect(
      markdownPhotoSources(`Hi ![one](${OWN}1.jpg#w=1&h=1) and ![two](<${OWN}2.png#w=2&h=2> "t")`),
    ).toEqual([`${OWN}1.jpg#w=1&h=1`, `${OWN}2.png#w=2&h=2`])
  })

  it('only our own uploads: cover and photos in the text', () => {
    const ok = { content: `![a](${OWN}1.jpg#w=10&h=10)`, coverImageUrl: `${OWN}c.jpg` }
    expect(blogPhotoProblem(ok, OWN)).toBeNull()
    expect(blogPhotoProblem({ ...ok, coverImageUrl: 'https://evil.com/c.jpg' }, OWN)).toMatch(
      /cover/,
    )
    expect(
      blogPhotoProblem({ ...ok, content: '![a](https://evil.com/x.jpg#w=1&h=1)' }, OWN),
    ).toMatch(/Insert photo/)
    expect(blogPhotoProblem({ ...ok, content: `![a](${OWN}1.jpg)` }, OWN)).toMatch(/Insert photo/)
  })
})

describe('when a post is live', () => {
  const now = new Date('2026-10-14T10:00:00Z')
  it('published AND its date has come; drafts, archived and future posts are not', () => {
    expect(isBlogPostLive({ status: 'PUBLISHED', publishedAt: '2026-10-14T09:00:00Z' }, now)).toBe(
      true,
    )
    expect(isBlogPostLive({ status: 'PUBLISHED', publishedAt: '2026-10-14T11:00:00Z' }, now)).toBe(
      false,
    )
    expect(isBlogPostLive({ status: 'DRAFT', publishedAt: '2026-10-01T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(isBlogPostLive({ status: 'ARCHIVED', publishedAt: '2026-10-01T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(isBlogPostLive({ status: 'PUBLISHED', publishedAt: null }, now)).toBe(false)
  })
})
