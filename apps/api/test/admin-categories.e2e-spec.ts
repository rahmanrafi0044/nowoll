// Step 36b: categories in the admin panel — the whole tree (hidden ones too)
// with product counts, the order of sister categories, archive and restore.
// Create / edit / archive themselves are tested in categories.e2e-spec.ts.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin categories (step 36b)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const admin = '/api/v1/admin/categories'

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('the whole tree, hidden ones included, with product counts (archived products not counted)', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id, isActive: false })
    await makeProduct({ categoryId: shirts.id })
    await makeProduct({ categoryId: shirts.id, status: 'DRAFT' })
    const old = await makeProduct({ categoryId: shirts.id })
    await db.product.update({ where: { id: old.id }, data: { deletedAt: new Date() } })
    const archived = await makeCategory({ name: 'Gone' })
    await db.category.update({ where: { id: archived.id }, data: { deletedAt: new Date() } })

    const tree = (await http().get(admin).expect(200)).body.data
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ name: 'Men', isActive: true, productCount: 0, parentId: null })
    expect(tree[0].children).toEqual([
      expect.objectContaining({
        id: shirts.id,
        name: 'Shirts',
        isActive: false,
        productCount: 2,
        parentId: men.id,
        children: [],
      }),
    ])
    // The shop's tree hides it.
    expect((await http().get('/api/v1/categories')).body.data[0].children).toEqual([])
  })

  it('order: sister categories in the new order — the shop follows it', async () => {
    const a = await makeCategory({ name: 'A' })
    const b = await makeCategory({ name: 'B' })
    const c = await makeCategory({ name: 'C' })
    await http()
      .patch(`${admin}/order`)
      .send({ parentId: null, ids: [c.id, a.id, b.id] })
      .expect(200)
    const names = (await http().get('/api/v1/categories')).body.data.map(
      (x: { name: string }) => x.name,
    )
    expect(names).toEqual(['C', 'A', 'B'])
  })

  it('order: refused unless the list is exactly that group (a stale page can’t scramble it)', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    const women = await makeCategory({ name: 'Women' })
    const order = (body: object) => http().patch(`${admin}/order`).send(body)
    await order({ parentId: null, ids: [men.id] }).expect(409) // Women missing
    await order({ parentId: null, ids: [men.id, women.id, shirts.id] }).expect(409) // not a sister
    await order({ parentId: men.id, ids: [shirts.id] }).expect(200)
    await order({ ids: [men.id, women.id] }).expect(400) // parentId must be given (null = top level)
    await order({ parentId: 'x', ids: [men.id] }).expect(400)
  })

  it('archive → listed as archived → restore: back HIDDEN; at the top level if its parent is archived too', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    await http().delete(`/api/v1/categories/${shirts.id}`).expect(200)
    await http().delete(`/api/v1/categories/${men.id}`).expect(200)

    const list = (await http().get(`${admin}?archived=1`).expect(200)).body.data
    expect(list.map((c: { name: string }) => c.name).sort()).toEqual(['Men', 'Shirts'])
    expect(list[0].archivedAt).toEqual(expect.any(String))

    const r = (await http().post(`${admin}/${shirts.id}/restore`).expect(200)).body.data
    expect(r).toMatchObject({ deletedAt: null, isActive: false, parentId: null })
    expect((await http().get(admin)).body.data.map((c: { id: string }) => c.id)).toEqual([
      shirts.id,
    ])
    expect((await http().get('/api/v1/categories')).body.data).toEqual([]) // hidden until switched on
    await http().post(`${admin}/${shirts.id}/restore`).expect(404) // not archived any more
  })

  it('restore always comes back hidden — even a category archived while switched on (older data)', async () => {
    const c = await makeCategory({ name: 'Kids' })
    await db.category.update({ where: { id: c.id }, data: { deletedAt: new Date() } }) // still isActive: true
    const r = (await http().post(`${admin}/${c.id}/restore`).expect(200)).body.data
    expect(r).toMatchObject({ isActive: false, deletedAt: null })
    expect((await http().get('/api/v1/categories')).body.data).toEqual([])
  })

  it('restore keeps the parent when the parent is still there', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    await http().delete(`/api/v1/categories/${shirts.id}`).expect(200)
    expect((await http().post(`${admin}/${shirts.id}/restore`)).body.data.parentId).toBe(men.id)
  })

  it('a hidden category: the shop gets 200 + null (so its cached page updates), not 404', async () => {
    const c = await makeCategory({ name: 'Eid', isActive: false })
    expect((await http().get(`/api/v1/categories/${c.slug}`).expect(200)).body.data).toBeNull()
  })

  it('admin-only', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const h = () => request(outsider.getHttpServer())
      const id = '00000000-0000-4000-8000-000000000000'
      await h().get(admin).expect(401)
      await h()
        .patch(`${admin}/order`)
        .send({ parentId: null, ids: [id] })
        .expect(401)
      await h().post(`${admin}/${id}/restore`).expect(401)
    } finally {
      await outsider.close()
    }
  })
})
