// 38f: size charts. Made in Admin → Size charts, used by a product or a whole
// category (the product's own wins), shown inside the product page's data.
// Switched-off charts stop showing; nothing is ever deleted.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

const kameez = {
  name: 'Kameez',
  columns: ['Chest', 'Length'],
  rows: [
    { size: 'S', values: ['36', '40'] },
    { size: 'M', values: ['38', '41'] },
  ],
}
const chart = (name: string, extra: object = {}) => ({ name, pieces: [kameez], ...extra })

describe('size charts (38f)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const admin = '/api/v1/admin/size-charts'
  const create = async (body: object) => (await http().post(admin).send(body).expect(201)).body.data
  const pdp = async (slug: string) =>
    (await http().get(`/api/v1/products/${slug}`).expect(200)).body.data

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true, role: 'STAFF' }) // staff may manage charts, like products
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  it('creates, lists with usage counts, and edits a chart', async () => {
    const c = await create(chart('Three-piece — regular', { note: 'Measured flat.' }))
    expect(c).toMatchObject({ unit: 'INCH', isActive: true, note: 'Measured flat.' })
    const cat = await makeCategory()
    await db.category.update({ where: { id: cat.id }, data: { sizeChartId: c.id } })
    await makeProduct({ categoryId: cat.id })
    const [listed] = (await http().get(admin).expect(200)).body.data
    expect(listed).toMatchObject({
      name: 'Three-piece — regular',
      categoryCount: 1,
      productCount: 0,
    })

    const edited = (
      await http()
        .patch(`${admin}/${c.id}`)
        .send(chart('Three-piece — loose', { unit: 'CM' }))
        .expect(200)
    ).body.data
    expect(edited).toMatchObject({ name: 'Three-piece — loose', unit: 'CM', note: null })
  })

  it('refuses a chart that breaks the rules, saying where', async () => {
    const res = await http()
      .post(admin)
      .send(chart('Bad', { pieces: [{ ...kameez, rows: [{ size: 'S', values: ['big', '40'] }] }] }))
      .expect(400)
    expect(res.body.error).toBe('INVALID_SIZE_CHART')
    expect(res.body.details).toEqual(['Piece 1 › row 1: Numbers only, e.g. 38, 38.5 or 38-40'])
  })

  it("the product page shows the product's own chart, else its category's, else none", async () => {
    const forCategory = await create(chart('Category chart'))
    const own = await create(
      chart('Own chart', { pieces: [{ ...kameez, name: 'Kurti' }], unit: 'CM' }),
    )
    const cat = await makeCategory()
    const p1 = await makeProduct({ categoryId: cat.id })
    const p2 = await makeProduct({ categoryId: cat.id })
    expect((await pdp(p1.slug)).sizeChart).toBeNull()

    // Linking goes through the normal admin product / category forms.
    await http()
      .patch(`/api/v1/categories/${cat.id}`)
      .send({ sizeChartId: forCategory.id })
      .expect(200)
    await http().patch(`/api/v1/products/${p2.id}`).send({ sizeChartId: own.id }).expect(200)

    expect((await pdp(p1.slug)).sizeChart).toEqual({ unit: 'INCH', note: null, pieces: [kameez] })
    expect((await pdp(p2.slug)).sizeChart).toMatchObject({
      unit: 'CM',
      pieces: [{ name: 'Kurti' }],
    })

    // Switching the product's own chart off → the category's shows again.
    await http()
      .patch(`${admin}/${own.id}`)
      .send(chart('Own chart', { isActive: false }))
      .expect(200)
    expect((await pdp(p2.slug)).sizeChart).toMatchObject({ pieces: [{ name: 'Kameez' }] })

    // Unlinking (null) works too.
    await http().patch(`/api/v1/categories/${cat.id}`).send({ sizeChartId: null }).expect(200)
    expect((await pdp(p1.slug)).sizeChart).toBeNull()
  })

  it('a chart on a parent category covers its subcategories; the nearest one wins', async () => {
    const women = await makeCategory({ name: 'Women' })
    const kurtis = await makeCategory({ name: 'Kurtis', parentId: women.id })
    const p = await makeProduct({ categoryId: kurtis.id })
    const parentChart = await create(chart('Women — general'))
    await db.category.update({ where: { id: women.id }, data: { sizeChartId: parentChart.id } })
    expect((await pdp(p.slug)).sizeChart).toMatchObject({ pieces: [{ name: 'Kameez' }] })

    const kurtiChart = await create(chart('Kurtis', { pieces: [{ ...kameez, name: 'Kurti' }] }))
    await db.category.update({ where: { id: kurtis.id }, data: { sizeChartId: kurtiChart.id } })
    expect((await pdp(p.slug)).sizeChart).toMatchObject({ pieces: [{ name: 'Kurti' }] })
  })

  it('refuses a link to a chart that does not exist', async () => {
    const cat = await makeCategory()
    const p = await makeProduct({ categoryId: cat.id })
    const res = await http()
      .patch(`/api/v1/products/${p.id}`)
      .send({ sizeChartId: '00000000-0000-4000-8000-000000000000' })
      .expect(400)
    expect(res.body.error).toBe('SIZE_CHART_NOT_FOUND')
  })
})
