// Step 43c — redirects: old web address → new one.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('Redirects (step 43c)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const add = (body: object) => http().post('/api/v1/admin/redirects').send(body)
  const rules = async () => (await http().get('/api/v1/redirects').expect(200)).body.data

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: true })
  })
  afterEach(() => app.close())

  it('add (cleaned) → in the shop’s rules; switched off → not; removed → gone', async () => {
    const r = (
      await add({ fromPath: '/Old-Sale/?utm=fb', toPath: '/shop?sort=newest' }).expect(201)
    ).body.data
    expect(r).toMatchObject({
      fromPath: '/old-sale',
      toPath: '/shop?sort=newest',
      permanent: true,
      source: 'MANUAL',
    })
    expect(await rules()).toEqual([{ from: '/old-sale', to: '/shop?sort=newest', permanent: true }])

    await http()
      .patch(`/api/v1/admin/redirects/${r.id}`)
      .send({ fromPath: '/old-sale', toPath: '/shop', isActive: false })
      .expect(200)
    expect(await rules()).toEqual([])
    await http().delete(`/api/v1/admin/redirects/${r.id}`).expect(200)
    expect(await db.redirect.count()).toBe(0)
  })

  it('refused: other websites, protected addresses, itself, a second rule for the same address', async () => {
    for (const body of [
      { fromPath: '/old', toPath: 'https://evil.example' },
      { fromPath: '/old', toPath: '//evil.example' },
      { fromPath: '/checkout', toPath: '/shop' },
      { fromPath: '/', toPath: '/shop' },
      { fromPath: '/old', toPath: '/OLD/' },
    ])
      await add(body).expect(400)
    await add({ fromPath: '/old', toPath: '/shop' }).expect(201)
    expect((await add({ fromPath: '/old', toPath: '/shop/eid' }).expect(409)).body.error).toBe(
      'REDIRECT_EXISTS',
    )
  })

  it('no loops: A → B when B → A exists is refused', async () => {
    await add({ fromPath: '/b', toPath: '/a' }).expect(201)
    expect((await add({ fromPath: '/a', toPath: '/b' }).expect(400)).body.error).toBe(
      'REDIRECT_LOOP',
    )
  })

  it('no chains: visitors always make ONE hop', async () => {
    await add({ fromPath: '/b', toPath: '/c' }).expect(201)
    // Forward: A → B, and B → C exists → A is saved as → C.
    expect((await add({ fromPath: '/a', toPath: '/b' }).expect(201)).body.data.toPath).toBe('/c')
    // Backward: X → Y exists; now Y → Z → X now points at Z.
    await add({ fromPath: '/x', toPath: '/y' }).expect(201)
    await add({ fromPath: '/y', toPath: '/z' }).expect(201)
    const all = Object.fromEntries(
      (await rules()).map((r: { from: string; to: string }) => [r.from, r.to]),
    )
    expect(all).toEqual({ '/a': '/c', '/b': '/c', '/x': '/z', '/y': '/z' })
  })

  it('automatic: a product, category or page with a new address — the old one leads to the new', async () => {
    const c = await makeCategory({ name: 'Panjabi' })
    const p = await makeProduct({ categoryId: c.id, name: 'Silk Panjabi' })
    await http().patch(`/api/v1/products/${p.id}`).send({ slug: 'eid-silk-panjabi' }).expect(200)
    await http().patch(`/api/v1/categories/${c.id}`).send({ slug: 'panjabi-2026' }).expect(200)
    const page = (
      await http()
        .post('/api/v1/admin/pages')
        .send({ title: 'About', slug: 'about', content: 'Hi', status: 'PUBLISHED' })
        .expect(201)
    ).body.data
    await http().patch(`/api/v1/admin/pages/${page.id}`).send({ slug: 'our-story' }).expect(200)

    expect(await rules()).toEqual(
      expect.arrayContaining([
        { from: `/products/${p.slug}`, to: '/products/eid-silk-panjabi', permanent: true },
        { from: `/shop/${c.slug}`, to: '/shop/panjabi-2026', permanent: true },
        { from: '/about', to: '/our-story', permanent: true },
      ]),
    )
    expect(await db.redirect.findFirst({ where: { fromPath: '/about' } })).toMatchObject({
      source: 'AUTO',
    })

    // Renamed again: still one hop from the first address; changing it BACK
    // removes the rule from that address (the page lives there again).
    await http().patch(`/api/v1/admin/pages/${page.id}`).send({ slug: 'about-us' }).expect(200)
    const now = Object.fromEntries(
      (await rules()).map((r: { from: string; to: string }) => [r.from, r.to]),
    )
    expect(now['/about']).toBe('/about-us')
    expect(now['/our-story']).toBe('/about-us')
    await http().patch(`/api/v1/admin/pages/${page.id}`).send({ slug: 'about' }).expect(200)
    const back = Object.fromEntries(
      (await rules()).map((r: { from: string; to: string }) => [r.from, r.to]),
    )
    expect(back['/about']).toBeUndefined()
    expect(back['/about-us']).toBe('/about')
  })

  it('automatic: a blog post with a new address — the old link leads to the new', async () => {
    const body = {
      title: 'Eid looks',
      slug: 'eid-looks',
      excerpt: 'Panjabis for Eid.',
      content: 'Crisp cotton.',
      tags: [],
      status: 'PUBLISHED',
    }
    const post = (await http().post('/api/v1/admin/blog').send(body).expect(201)).body.data
    await http()
      .patch(`/api/v1/admin/blog/${post.id}`)
      .send({ ...body, slug: 'eid-looks-2026' })
      .expect(200)
    expect(await rules()).toEqual([
      { from: '/blog/eid-looks', to: '/blog/eid-looks-2026', permanent: true },
    ])
    // Saving again without changing the address adds nothing.
    await http()
      .patch(`/api/v1/admin/blog/${post.id}`)
      .send({ ...body, slug: 'eid-looks-2026', title: 'Eid looks 2026' })
      .expect(200)
    expect(await db.redirect.count()).toBe(1)
  })

  it('a renamed product without a slug change makes no redirect', async () => {
    const c = await makeCategory()
    const p = await makeProduct({ categoryId: c.id })
    await http().patch(`/api/v1/products/${p.id}`).send({ name: 'New name' }).expect(200)
    expect(await db.redirect.count()).toBe(0)
  })

  it('Staff may manage redirects; signed-out visitors may not; the shop’s rules are public', async () => {
    const staff = await createTestApp({ asAdmin: true, role: 'STAFF' })
    const outsider = await createTestApp({ asAdmin: false })
    try {
      await request(staff.getHttpServer())
        .post('/api/v1/admin/redirects')
        .send({ fromPath: '/x', toPath: '/shop' })
        .expect(201)
      await request(outsider.getHttpServer()).get('/api/v1/admin/redirects').expect(401)
      await request(outsider.getHttpServer()).get('/api/v1/redirects').expect(200)
    } finally {
      await staff.close()
      await outsider.close()
    }
  })
})
