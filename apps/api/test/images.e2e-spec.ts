// HTTP tests for product image upload/update/delete. Real database, in-memory storage.
import type { NestExpressApplication } from '@nestjs/platform-express'
import sharp from 'sharp'
import request from 'supertest'
import { IMAGE_STORAGE } from '../src/storage/image-storage.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { jpegWithGps, png } from './utils/images.js'
import type { MemoryImageStorage } from './utils/memory-image-storage.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

afterAll(() => testPrisma().$disconnect())

describe('product images API', () => {
  let app: NestExpressApplication
  let storage: MemoryImageStorage
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
    storage = app.get(IMAGE_STORAGE)
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await resetDatabase()
    storage.files.clear()
  })

  async function draft() {
    const c = await makeCategory()
    return makeProduct({ categoryId: c.id, status: 'DRAFT', withImage: false })
  }
  const upload = (productId: string, file: Buffer, filename = 'photo.jpg') =>
    http().post(`/api/v1/products/${productId}/images`).attach('file', file, filename)

  it('uploads: strips GPS, stores under a random name, records the row', async () => {
    const p = await draft()
    const res = await upload(p.id, await jpegWithGps(), '../../etc/passwd ☠️.jpg')
      .field('altText', 'Blue shirt, front')
      .expect(201)

    const image = res.body.data
    expect(image.storagePath).toMatch(new RegExp(`^products/${p.id}/[0-9a-f-]{36}\\.jpg$`))
    expect(image.url).toContain(image.storagePath)
    expect(image).toMatchObject({ altText: 'Blue shirt, front', sortOrder: 0 })

    const stored = storage.files.get(image.storagePath)!
    expect(stored.contentType).toBe('image/jpeg')
    expect((await sharp(stored.data).metadata()).exif).toBeUndefined()
  })

  it('appends later images and links one to a variant', async () => {
    const p = await draft()
    await upload(p.id, await png())
      .field('altText', 'A')
      .expect(201)
    const second = await upload(p.id, await png())
      .field('altText', 'B')
      .field('variantId', p.variants[0]!.id)
      .expect(201)
    expect(second.body.data).toMatchObject({ sortOrder: 1, variantId: p.variants[0]!.id })
  })

  it('judges files by their content, not their name or declared type', async () => {
    const p = await draft()
    const php = Buffer.from('<?php echo "pwned"; ?>')
    const res = await http()
      .post(`/api/v1/products/${p.id}/images`)
      .attach('file', php, { filename: 'innocent.jpg', contentType: 'image/jpeg' })
      .field('altText', 'x')
      .expect(415)
    expect(res.body).toMatchObject({ success: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
    expect(storage.files.size).toBe(0)
  })

  it('accepts a PNG even when it is named .jpg (content wins)', async () => {
    const p = await draft()
    const res = await upload(p.id, await png(), 'misnamed.jpg')
      .field('altText', 'x')
      .expect(201)
    expect(res.body.data.storagePath).toMatch(/\.png$/)
  })

  it('rejects files over 5 MB with 413 and stores nothing', async () => {
    const p = await draft()
    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(5 * 1024 * 1024 + 10),
    ])
    await upload(p.id, huge).field('altText', 'x').expect(413)
    expect(storage.files.size).toBe(0)
  })

  it.each([
    ['no file', null, { altText: 'x' }],
    ['no alt text', 'jpeg', {}],
    [
      'variant from another product',
      'jpeg',
      { altText: 'x', variantId: '00000000-0000-0000-0000-000000000000' },
    ],
  ] as const)('rejects: %s', async (_label, kind, fields) => {
    const p = await draft()
    let req = http().post(`/api/v1/products/${p.id}/images`)
    if (kind) req = req.attach('file', await jpegWithGps(), 'a.jpg')
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v)
    await req.expect(400)
    expect(storage.files.size).toBe(0)
  })

  it('updates alt text and order', async () => {
    const p = await draft()
    const { body } = await upload(p.id, await png()).field('altText', 'old')
    const res = await http()
      .patch(`/api/v1/products/${p.id}/images/${body.data.id}`)
      .send({ altText: 'new', sortOrder: 5 })
      .expect(200)
    expect(res.body.data).toMatchObject({ altText: 'new', sortOrder: 5 })
  })

  it('deletes the row and the file', async () => {
    const p = await draft()
    const { body } = await upload(p.id, await png()).field('altText', 'x')
    await http().delete(`/api/v1/products/${p.id}/images/${body.data.id}`).expect(200)
    expect(storage.files.size).toBe(0)
    expect(await testPrisma().productImage.count()).toBe(0)
  })

  it('refuses to delete the last image of a published product, keeping the file', async () => {
    const p = await draft()
    const { body } = await upload(p.id, await png()).field('altText', 'x')
    await http().patch(`/api/v1/products/${p.id}`).send({ status: 'ACTIVE' }).expect(200)

    const res = await http().delete(`/api/v1/products/${p.id}/images/${body.data.id}`).expect(409)
    expect(res.body.message).toMatch(/needs an image/)
    expect(storage.files.size).toBe(1)
  })

  it('404s for an image of a different product', async () => {
    const a = await draft()
    const b = await draft()
    const { body } = await upload(a.id, await png()).field('altText', 'x')
    await http().delete(`/api/v1/products/${b.id}/images/${body.data.id}`).expect(404)
  })
})

describe('product images API — without admin access', () => {
  let app: NestExpressApplication
  beforeAll(async () => {
    app = await createTestApp({ asAdmin: false })
  })
  afterAll(() => app.close())

  it('refuses uploads with 401 before reading the file', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products/00000000-0000-0000-0000-000000000000/images')
      .attach('file', await png(), 'a.png')
      .field('altText', 'x')
      .expect(401)
    expect((app.get(IMAGE_STORAGE) as MemoryImageStorage).files.size).toBe(0)
  })
})
