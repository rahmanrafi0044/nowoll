// Step 37: delivery zones in the admin panel. The rules that keep checkout
// working: exactly one default zone (always on), a district in one zone at
// most, no deleting (orders point to their zone). Edits affect NEW checkouts.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin shipping (step 37)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const zones = '/api/v1/admin/shipping/zones'
  const list = async () => (await http().get(zones).expect(200)).body.data
  const byName = async (name: string) =>
    (await list()).find((z: { name: string }) => z.name === name)
  const newZone = {
    name: 'Dhaka suburbs',
    fee: 90,
    districts: ['Gazipur', 'Narayanganj'],
    isActive: true,
    estimatedDaysMin: 2,
    estimatedDaysMax: 3,
  }

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    await seedShippingZones()
  })

  it('lists every zone, the default (catch-all) last, switched-off ones included', async () => {
    const dhaka = await db.shippingZone.findUniqueOrThrow({ where: { code: 'DHAKA' } })
    await db.shippingZone.update({ where: { id: dhaka.id }, data: { isActive: false } })
    expect(
      (await list()).map((z: { name: string; isActive: boolean }) => [z.name, z.isActive]),
    ).toEqual([
      ['Inside Dhaka', false],
      ['Outside Dhaka', true],
    ])
    expect((await http().get('/api/v1/shipping/rates')).body.data).toHaveLength(1) // shop: on only
  })

  it('a new zone gets its own code; a fee change is what the next checkout charges', async () => {
    const z = (await http().post(zones).send(newZone).expect(201)).body.data
    expect(z).toMatchObject({
      code: 'DHAKA_SUBURBS',
      fee: '90',
      districts: ['Gazipur', 'Narayanganj'],
      isDefault: false,
      freeShippingThreshold: null,
    })
    await http()
      .post(zones)
      .send({ ...newZone, name: 'Dhaka suburbs ', districts: [] })
      .expect(409) // same name

    const c = await makeCategory()
    const p = await makeProduct({ categoryId: c.id, basePrice: '1000' })
    const quote = async (district: string) =>
      (
        await http()
          .post('/api/v1/checkout/quote')
          .send({ items: [{ variantId: p.variants[0]!.id, quantity: 1 }], district })
          .expect(200)
      ).body.data
    expect((await quote('Gazipur')).shipping.name).toBe('Dhaka suburbs')
    await http()
      .patch(`${zones}/${z.id}`)
      .send({ fee: 75, freeShippingThreshold: 1000 })
      .expect(200)
    expect((await quote('Gazipur')).totals).toMatchObject({ freeShipping: true, shippingFee: '0' })
    await http().patch(`${zones}/${z.id}`).send({ freeShippingThreshold: null }).expect(200)
    expect((await quote('Gazipur')).totals.shippingFee).toBe('75')
    expect((await quote('Sylhet')).totals.shippingFee).toBe('120') // default zone
  })

  it('a district is in one zone: refused with the details, or moved when asked', async () => {
    const dhaka = await byName('Inside Dhaka')
    const z = (await http().post(zones).send(newZone).expect(201)).body.data
    const r = await http()
      .patch(`${zones}/${dhaka.id}`)
      .send({ districts: ['Dhaka', 'Gazipur'] })
      .expect(409)
    expect(r.body.error).toBe('DISTRICT_IN_OTHER_ZONE')
    expect(r.body.details).toEqual(['Gazipur is in Dhaka suburbs'])
    expect((await byName('Inside Dhaka')).districts).toEqual(['Dhaka'])

    await http()
      .patch(`${zones}/${dhaka.id}`)
      .send({ districts: ['Gazipur', 'Dhaka'], moveDistricts: true })
      .expect(200)
    expect((await byName('Inside Dhaka')).districts).toEqual(['Dhaka', 'Gazipur']) // official order
    expect((await byName('Dhaka suburbs')).districts).toEqual(['Narayanganj'])
    expect(z.id).toBeDefined()
  })

  it('exactly one default, always on', async () => {
    const outside = await byName('Outside Dhaka')
    const dhaka = await byName('Inside Dhaka')
    await http().patch(`${zones}/${outside.id}`).send({ isActive: false }).expect(400)
    await http().patch(`${zones}/${outside.id}`).send({ isDefault: false }).expect(400)
    await http()
      .patch(`${zones}/${dhaka.id}`)
      .send({ isDefault: true, isActive: false })
      .expect(400)

    // Making another zone the default moves the badge; then the old one can be switched off.
    await http().patch(`${zones}/${dhaka.id}`).send({ isDefault: true }).expect(200)
    expect(
      (await list())
        .filter((z: { isDefault: boolean }) => z.isDefault)
        .map((z: { name: string }) => z.name),
    ).toEqual(['Inside Dhaka'])
    await http().patch(`${zones}/${outside.id}`).send({ isActive: false }).expect(200)
    // A new zone created as the default takes over too.
    await http()
      .post(zones)
      .send({ ...newZone, isDefault: true })
      .expect(201)
    expect(await db.shippingZone.count({ where: { isDefault: true } })).toBe(1)
  })

  it('refused: unknown districts, bad amounts, days the wrong way round, missing fields', async () => {
    const dhaka = await byName('Inside Dhaka')
    await http()
      .post(zones)
      .send({ ...newZone, districts: ['Dhakka'] })
      .expect(400)
    await http()
      .post(zones)
      .send({ ...newZone, fee: -1 })
      .expect(400)
    await http()
      .post(zones)
      .send({ ...newZone, fee: 10_001 })
      .expect(400)
    await http()
      .post(zones)
      .send({ ...newZone, fee: 60.555 })
      .expect(400)
    await http()
      .post(zones)
      .send({ ...newZone, freeShippingThreshold: 0 })
      .expect(400)
    await http()
      .post(zones)
      .send({ ...newZone, name: '  ' })
      .expect(400)
    await http().post(zones).send({ name: 'X', fee: 1, isActive: true }).expect(400) // no districts
    await http()
      .post(zones)
      .send({ ...newZone, code: 'HACK' })
      .expect(400) // not editable
    const r = await http()
      .patch(`${zones}/${dhaka.id}`)
      .send({ estimatedDaysMin: 5, estimatedDaysMax: 2 })
      .expect(400)
    expect(r.body.message).toMatch(/“from” can’t be more days than “to”/)
    await http().patch(`${zones}/${dhaka.id}`).send({ fee: 0 }).expect(200) // always free: allowed
    await http().patch(`${zones}/00000000-0000-4000-8000-000000000000`).send({ fee: 1 }).expect(404)
  })

  it('no delete (orders point to their zone)', async () => {
    const dhaka = await byName('Inside Dhaka')
    await http().delete(`${zones}/${dhaka.id}`).expect(404)
  })

  it('admin-only', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const h = () => request(outsider.getHttpServer())
      await h().get(zones).expect(401)
      await h().post(zones).send(newZone).expect(401)
      await h().patch(`${zones}/00000000-0000-4000-8000-000000000000`).send({ fee: 1 }).expect(401)
      await h().get('/api/v1/shipping/rates').expect(200) // the shop's read stays open
    } finally {
      await outsider.close()
    }
  })
})
