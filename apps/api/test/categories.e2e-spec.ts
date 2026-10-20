// HTTP-level tests for /api/v1/categories with the REAL database (nowoll_test)
// and the real middleware stack. Only AdminGuard is swapped out — real admin
// sign-in arrives in Phase 4.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp as createApp } from './utils/app.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

afterAll(() => testPrisma().$disconnect())

describe('categories API — as admin', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('full lifecycle: create → appears in tree → update → delete → gone', async () => {
    const created = await http()
      .post('/api/v1/categories')
      .send({ name: '  Men  ', sortOrder: 1 })
      .expect(201)
    expect(created.body).toMatchObject({ success: true, data: { name: 'Men', slug: 'men' } })
    const id = created.body.data.id as string

    const child = await http()
      .post('/api/v1/categories')
      .send({ name: 'Shirts', parentId: id })
      .expect(201)

    const tree = await http().get('/api/v1/categories').expect(200)
    expect(tree.body.data).toEqual([
      expect.objectContaining({
        slug: 'men',
        children: [expect.objectContaining({ slug: 'shirts', children: [] })],
      }),
    ])

    const detail = await http().get('/api/v1/categories/shirts').expect(200)
    expect(detail.body.data.breadcrumb).toEqual([{ id, name: 'Men', slug: 'men' }])

    await http()
      .patch(`/api/v1/categories/${id}`)
      .send({ description: 'For him' })
      .expect(200)
      .expect((res) => expect(res.body.data.description).toBe('For him'))

    // Can't delete a parent with children…
    const blocked = await http().delete(`/api/v1/categories/${id}`).expect(409)
    expect(blocked.body).toMatchObject({ success: false, error: 'CONFLICT' })

    // …so delete the child first, then the parent.
    await http().delete(`/api/v1/categories/${child.body.data.id}`).expect(200)
    await http().delete(`/api/v1/categories/${id}`).expect(200)
    // Gone for customers: 200 + null (Next.js only caches 200 answers — see findBySlug).
    expect((await http().get('/api/v1/categories/men').expect(200)).body.data).toBeNull()
    expect((await http().get('/api/v1/categories')).body.data).toEqual([])
  })

  it('clears an optional field when sent an empty string', async () => {
    const { body } = await http()
      .post('/api/v1/categories')
      .send({ name: 'Tees', description: 'Cotton' })
    const res = await http()
      .patch(`/api/v1/categories/${body.data.id}`)
      .send({ description: '   ' })
      .expect(200)
    expect(res.body.data.description).toBeNull()
  })

  it.each([
    ['missing name', {}],
    ['blank name', { name: '   ' }],
    ['bad slug', { name: 'X', slug: 'Not A Slug' }],
    ['non-https image', { name: 'X', imageUrl: 'http://example.com/a.jpg' }],
    ['bad parentId', { name: 'X', parentId: 'not-a-uuid' }],
    ['negative sortOrder', { name: 'X', sortOrder: -1 }],
    ['unknown field', { name: 'X', deletedAt: null }],
  ])('rejects invalid input: %s', async (_label, payload) => {
    const res = await http().post('/api/v1/categories').send(payload).expect(400)
    expect(res.body).toMatchObject({ success: false, error: 'VALIDATION_ERROR' })
  })

  it('38f: photo tiles are checked, saved and shown on the category', async () => {
    const { body } = await http().post('/api/v1/categories').send({ name: 'Kurtis' }).expect(201)
    const tile = {
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/content/eid.jpg',
      imageAlt: 'A model in a blush kurti',
      heading: 'The Eid edit',
      text: 'Soft colours for long days.',
      href: '/shop/kurtis?tag=eid',
      position: 4,
      wide: true,
    }
    await http()
      .patch(`/api/v1/categories/${body.data.id}`)
      .send({ editorial: [tile] })
      .expect(200)
    const pub = await http().get('/api/v1/categories/kurtis').expect(200)
    expect(pub.body.data.editorial).toEqual([tile])

    // Problems come back as a list, tile by tile; nothing is saved.
    const bad = await http()
      .patch(`/api/v1/categories/${body.data.id}`)
      .send({
        editorial: [
          { ...tile, imageUrl: 'http://not-secure.example/x.jpg', href: 'javascript:alert(1)' },
        ],
      })
      .expect(400)
    expect(bad.body.error).toBe('INVALID_EDITORIAL')
    expect(bad.body.details.join(' ')).toMatch(/Tile 1 › imageUrl/)
    expect(bad.body.details.join(' ')).toMatch(/Tile 1 › href/)
    // More than 3 tiles never reaches the service.
    await http()
      .patch(`/api/v1/categories/${body.data.id}`)
      .send({ editorial: [tile, tile, tile, tile] })
      .expect(400)
    expect((await http().get('/api/v1/categories/kurtis').expect(200)).body.data.editorial).toEqual(
      [tile],
    )
  })

  it('400s on a malformed id and 404s on an unknown one', async () => {
    await http().patch('/api/v1/categories/not-a-uuid').send({ name: 'X' }).expect(400)
    await http()
      .patch('/api/v1/categories/00000000-0000-0000-0000-000000000000')
      .send({ name: 'X' })
      .expect(404)
  })
})

describe('categories API — without admin access', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createApp({ asAdmin: false })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('lets anyone read', async () => {
    await http().get('/api/v1/categories').expect(200)
  })

  it.each([
    ['POST', '/api/v1/categories'],
    ['PATCH', '/api/v1/categories/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/api/v1/categories/00000000-0000-0000-0000-000000000000'],
  ])('refuses %s %s with 401 without an admin sign-in', async (method, url) => {
    const req =
      method === 'POST'
        ? http().post(url)
        : method === 'PATCH'
          ? http().patch(url)
          : http().delete(url)
    const res = await req.send({ name: 'Hacked' }).expect(401)
    expect(res.body).toMatchObject({ success: false, error: 'NOT_SIGNED_IN' })
    expect(await testPrisma().category.count()).toBe(0)
  })
})
