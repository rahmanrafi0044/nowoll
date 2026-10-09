// Step 36 (part 2): static pages — Privacy, Terms, Return policy, About, FAQ…
// Admin writes them in Markdown; the shop shows only PUBLISHED ones.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('pages (step 36 part 2)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const admin = '/api/v1/admin/pages'
  const page = { title: 'Return policy', slug: 'return-policy', content: '# Returns\n\n7 days.' }
  const create = (body: object) => http().post(admin).send(body)

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('create: a draft by default — hidden from the shop until published', async () => {
    const d = (await create(page).expect(201)).body.data
    expect(d).toMatchObject({ ...page, status: 'DRAFT', seoTitle: null, seoDescription: null })
    const shop = (await http().get('/api/v1/pages/return-policy').expect(200)).body
    expect(shop.data).toBeNull() // 200 + null, never 404: Next.js would keep a stale copy
    expect((await http().get('/api/v1/pages').expect(200)).body.data).toEqual([])

    await http().patch(`${admin}/${d.id}`).send({ status: 'PUBLISHED' }).expect(200)
    const pub = (await http().get('/api/v1/pages/return-policy').expect(200)).body.data
    expect(pub).toEqual({
      slug: 'return-policy',
      title: 'Return policy',
      content: '# Returns\n\n7 days.',
      seoTitle: null,
      seoDescription: null,
      updatedAt: expect.any(String),
    })
    expect((await http().get('/api/v1/pages').expect(200)).body.data).toEqual([
      { slug: 'return-policy', title: 'Return policy' },
    ])
  })

  it('refused: addresses the shop uses, bad addresses, too long — every problem listed', async () => {
    const res = await create({ ...page, slug: 'cart', title: '' }).expect(400)
    expect(res.body.error).toBe('INVALID_PAGE')
    expect(res.body.details.join(' ')).toMatch(/slug.*already uses this address/)
    expect(res.body.details.join(' ')).toMatch(/title/)
    await create({ ...page, slug: 'Return Policy' }).expect(400)
    await create({ ...page, content: 'x'.repeat(30_001) }).expect(400)
    await create({ ...page, status: 'ARCHIVED' }).expect(400) // archive = DELETE
    await create({ ...page, html: '<script>' }).expect(400) // unknown fields refused
    expect(await db.page.count()).toBe(0)
  })

  it('a full-length page in Bangla fits inside the request limit', async () => {
    const content = 'অ'.repeat(30_000) // 3 bytes each → ~90 KB
    await create({ ...page, content }).expect(201)
  })

  it('one page per address: taken → 409, an archived page says how to get it back', async () => {
    const d = (await create(page).expect(201)).body.data
    expect((await create(page).expect(409)).body.message).toMatch(/Another page already uses/)
    await http().delete(`${admin}/${d.id}`).expect(200)
    expect((await create(page).expect(409)).body.message).toMatch(/archived page.*Restore/)
    const other = (await create({ ...page, slug: 'returns-2' }).expect(201)).body.data
    expect(
      (await http().patch(`${admin}/${other.id}`).send({ slug: 'return-policy' }).expect(409)).body
        .message,
    ).toMatch(/archived page.*Restore/)
  })

  it('edit: partial changes, the whole page re-checked; SEO fields cleared with ""', async () => {
    const d = (
      await create({ ...page, seoTitle: 'Returns | Nowoll', status: 'PUBLISHED' }).expect(201)
    ).body.data
    const e = (
      await http()
        .patch(`${admin}/${d.id}`)
        .send({ title: '  Returns ', seoTitle: '', seoDescription: 'Return within 7 days.' })
        .expect(200)
    ).body.data
    expect(e).toMatchObject({
      title: 'Returns',
      slug: 'return-policy',
      status: 'PUBLISHED',
      seoTitle: null,
      seoDescription: 'Return within 7 days.',
    })
    await http().patch(`${admin}/${d.id}`).send({ slug: 'checkout' }).expect(400)
    // A new address: the old one stops working on the shop.
    await http().patch(`${admin}/${d.id}`).send({ slug: 'returns' }).expect(200)
    expect((await http().get('/api/v1/pages/return-policy')).body.data).toBeNull()
    expect((await http().get('/api/v1/pages/returns')).body.data.title).toBe('Returns')
  })

  it('archive (soft) hides it and keeps it; restore brings it back as a draft', async () => {
    const d = (await create({ ...page, status: 'PUBLISHED' }).expect(201)).body.data
    const a = (await http().delete(`${admin}/${d.id}`).expect(200)).body.data
    expect(a.status).toBe('ARCHIVED')
    expect(await db.page.count()).toBe(1)
    expect((await http().get('/api/v1/pages/return-policy')).body.data).toBeNull()
    expect((await http().get(admin).expect(200)).body.data).toEqual([]) // hidden from the normal list
    expect(
      (await http().get(`${admin}?status=ARCHIVED`).expect(200)).body.data.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([d.id])
    await http().patch(`${admin}/${d.id}`).send({ status: 'DRAFT' }).expect(200)
    expect((await http().get(admin)).body.data[0].status).toBe('DRAFT')
  })

  it('starter pages: six drafts in footer order; pressing again adds nothing, overwrites nothing', async () => {
    await create({ ...page, slug: 'faq', title: 'My FAQ', content: 'Mine' }).expect(201)
    const r = (await http().post(`${admin}/starter`).expect(201)).body.data
    expect(r.created).toEqual(['privacy', 'terms', 'return-policy', 'about', 'contact'])
    const all = (await http().get(admin)).body.data
    expect(all.map((p: { slug: string }) => p.slug)).toEqual([
      'faq',
      'privacy',
      'terms',
      'return-policy',
      'about',
      'contact',
    ])
    expect(all.every((p: { status: string }) => p.status === 'DRAFT')).toBe(true)
    expect((await db.page.findUnique({ where: { slug: 'faq' } }))!.content).toBe('Mine')
    expect((await http().post(`${admin}/starter`).expect(201)).body.data.created).toEqual([])
    const privacy = await db.page.findUnique({ where: { slug: 'privacy' } })
    expect(privacy!.content).toContain('[fill in')
  })

  it('missing page → 404 in the admin; bad ids → 400', async () => {
    await http().get(`${admin}/00000000-0000-4000-8000-000000000000`).expect(404)
    await http().get(`${admin}/nope`).expect(400)
    await http().get(`${admin}?status=GONE`).expect(400)
  })

  it('admin-only (the shop’s reads stay open)', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const h = () => request(outsider.getHttpServer())
      await h().get(admin).expect(401)
      await h().post(admin).send(page).expect(401)
      await h().post(`${admin}/starter`).expect(401)
      await h().patch(`${admin}/00000000-0000-4000-8000-000000000000`).send({}).expect(401)
      await h().delete(`${admin}/00000000-0000-4000-8000-000000000000`).expect(401)
      await h().get('/api/v1/pages').expect(200)
      await h().get('/api/v1/pages/privacy').expect(200)
    } finally {
      await outsider.close()
    }
  })
})
