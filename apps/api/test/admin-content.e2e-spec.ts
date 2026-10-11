// Step 36 (part 1): editing the storefront's content blocks from the admin panel
// — announcement bar, hero, the homepage builder — and uploading their pictures.
// The API is the gatekeeper: nothing outside a block's format is ever stored.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { IMAGE_STORAGE } from '../src/storage/image-storage.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct } from './utils/factories.js'
import { png } from './utils/images.js'
import type { MemoryImageStorage } from './utils/memory-image-storage.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin content (step 36)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())
  const save = (key: string, data: unknown, isActive = true) =>
    http().put(`/api/v1/admin/content-blocks/${key}`).send({ data, isActive })

  beforeAll(async () => {
    app = await createTestApp({ asAdmin: true })
  })
  afterAll(() => app.close())
  beforeEach(() => resetDatabase())

  describe('saving blocks', () => {
    it('announcement bar: saved cleaned up (trimmed, defaults), served to the shop when on', async () => {
      const d = (await save('announcement_bar', { text: '  Eid sale — 20% off  ' }).expect(200))
        .body.data
      expect(d).toMatchObject({
        key: 'announcement_bar',
        data: { text: 'Eid sale — 20% off', href: null },
        isActive: true,
        valid: true,
      })
      expect(
        (await http().get('/api/v1/content-blocks/announcement_bar').expect(200)).body.data.data
          .text,
      ).toBe('Eid sale — 20% off')
      await save('announcement_bar', { text: 'Eid sale' }, false).expect(200)
      expect(
        (await http().get('/api/v1/content-blocks/announcement_bar').expect(200)).body.data,
      ).toBeNull() // off → hidden
    })

    it('refuses anything outside the format, listing every problem — nothing is stored', async () => {
      const res = await save('homepage_hero', {
        heading: '',
        ctaLabel: 'Shop',
        ctaHref: 'javascript:alert(1)',
        imageUrl: 'http://evil.example/a.jpg',
      }).expect(400)
      expect(res.body.error).toBe('INVALID_CONTENT')
      expect(res.body.details.join(' ')).toMatch(/heading/)
      expect(res.body.details.join(' ')).toMatch(/ctaHref/)
      expect(res.body.details.join(' ')).toMatch(/imageUrl/)
      expect(await db.contentBlock.count()).toBe(0)
    })

    it('homepage builder: the whole layout must be valid to save (no unknown section types)', async () => {
      await save('homepage_layout', {
        sections: [{ id: 'x', type: 'html', html: '<script>alert(1)</script>' }],
      }).expect(400)
      await save('homepage_layout', {
        sections: [
          { id: 'a', type: 'hero' },
          { id: 'a', type: 'newsletter' },
        ],
      }).expect(400)
      const ok = await save('homepage_layout', {
        sections: [
          {
            id: 'badges',
            type: 'trust_badges',
            badges: [{ icon: 'cash', text: 'Cash on delivery' }],
          },
          {
            id: 'eid',
            type: 'products',
            title: 'Eid collection',
            source: { kind: 'tag', tag: 'eid' },
          },
          { id: 'hero', type: 'hero', visible: false },
        ],
      }).expect(200)
      expect(ok.body.data.data.sections.map((s: { id: string }) => s.id)).toEqual([
        'badges',
        'eid',
        'hero',
      ])
      expect(ok.body.data.data.sections[1].limit).toBe(8) // default filled in
    })

    it('a section broken later (e.g. edited in the database) hides only itself on the shop', async () => {
      await db.contentBlock.create({
        data: {
          key: 'homepage_layout',
          isActive: true,
          data: {
            sections: [
              { id: 'hero', type: 'hero' },
              { id: 'bad', type: 'banners', banners: [] },
              { id: 'news', type: 'newsletter' },
            ],
          },
        },
      })
      const served = (await http().get('/api/v1/content-blocks/homepage_layout').expect(200)).body
        .data.data
      expect(served.sections.map((s: { id: string }) => s.id)).toEqual(['hero', 'news'])
      const admin = (await http().get('/api/v1/admin/content-blocks/homepage_layout').expect(200))
        .body.data
      expect(admin.valid).toBe(false) // the editor can say "something here needs fixing"
    })

    it('clear (DELETE): empties the block and switches it off — the row is kept (soft), the shop shows nothing', async () => {
      await save('announcement_bar', { text: 'Eid sale', href: '/shop' }).expect(200)
      const cleared = (
        await http().delete('/api/v1/admin/content-blocks/announcement_bar').expect(200)
      ).body.data
      expect(cleared).toMatchObject({ data: null, isActive: false, valid: true })
      expect(cleared.updatedAt).not.toBeNull() // still there — soft, not deleted
      expect(await db.contentBlock.count({ where: { key: 'announcement_bar' } })).toBe(1)
      expect(
        (await http().get('/api/v1/content-blocks/announcement_bar').expect(200)).body.data,
      ).toBeNull()
      // A new announcement can be written afterwards as usual.
      await save('announcement_bar', { text: 'New' }).expect(200)
      await http().get('/api/v1/content-blocks/announcement_bar').expect(200)
      // Never saved → clearing still works; unknown keys → 404.
      await http().delete('/api/v1/admin/content-blocks/homepage_hero').expect(200)
      await http().delete('/api/v1/admin/content-blocks/internal_notes').expect(404)
    })

    it('list: every editable block, saved or not; unknown keys → 404', async () => {
      await save('announcement_bar', { text: 'Hello' }).expect(200)
      const blocks = (await http().get('/api/v1/admin/content-blocks').expect(200)).body.data
      expect(blocks.map((b: { key: string }) => b.key).sort()).toEqual([
        'announcement_bar',
        'footer',
        'homepage_hero',
        'homepage_layout',
        'main_menu',
        'product_info',
      ])
      expect(blocks.find((b: { key: string }) => b.key === 'homepage_hero')).toMatchObject({
        data: null,
        isActive: false,
        updatedAt: null,
      })
      await http().get('/api/v1/admin/content-blocks/internal_notes').expect(404)
      await save('internal_notes', { x: 1 }).expect(404)
      await http()
        .put('/api/v1/admin/content-blocks/announcement_bar')
        .send({ data: { text: 'x' } })
        .expect(400) // isActive required
    })
  })

  describe('menu and footer (step 38b)', () => {
    const cat = '0f8fad5b-d9cb-469f-a165-70867728950e'

    it('menu: saved cleaned and served to the shop; drop-downs and javascript: refused', async () => {
      const r = await save('main_menu', {
        items: [
          { id: 'all', kind: 'shop_all' },
          { id: 'eid', kind: 'category', categoryId: cat, label: '  Eid ' },
          { id: 'sale', kind: 'link', label: 'Sale', href: '/shop?tag=sale' },
        ],
      }).expect(200)
      expect(r.body.data.data.items[1]).toEqual({
        id: 'eid',
        kind: 'category',
        categoryId: cat,
        label: 'Eid',
      })
      const shop = (await http().get('/api/v1/content-blocks/main_menu').expect(200)).body.data
      expect(shop.data.items).toHaveLength(3)
      await save('main_menu', {
        items: [{ id: 'x', kind: 'dropdown', label: 'More', items: [] }],
      }).expect(400)
      const bad = await save('main_menu', {
        items: [{ id: 'x', kind: 'link', label: 'Win', href: 'javascript:alert(1)' }],
      }).expect(400)
      expect(bad.body.details.join(' ')).toMatch(/href/)
    })

    it('footer: defaults filled in; only the fixed payment badges', async () => {
      const r = await save('footer', {
        about: 'Clothing made in Dhaka.',
        payments: ['cod', 'bkash'],
      }).expect(200)
      expect(r.body.data.data).toEqual({
        about: 'Clothing made in Dhaka.',
        columns: [],
        autoPages: true,
        payments: ['cod', 'bkash'],
        copyright: '',
      })
      await save('footer', { payments: ['paypal'] }).expect(400)
      await save('footer', { about: '<script>', unknown: 1 }).expect(200) // extra keys dropped; text is text
      const served = (await http().get('/api/v1/content-blocks/footer').expect(200)).body.data.data
      expect(served).not.toHaveProperty('unknown')
      expect(served.about).toBe('<script>') // shown as text by React, never as HTML
    })
  })

  it('product info box (step 38d): defaults filled in, served once switched on; javascript: refused', async () => {
    const r = await save('product_info', {
      lines: ['100% cotton'],
      link: { label: 'Return policy', href: '/return-policy' },
    }).expect(200)
    expect(r.body.data.data).toEqual({
      title: 'Delivery and returns',
      showDelivery: true,
      showReturns: true,
      showCod: true,
      lines: ['100% cotton'],
      link: { label: 'Return policy', href: '/return-policy' },
    })
    expect(
      (await http().get('/api/v1/content-blocks/product_info').expect(200)).body.data.data.lines,
    ).toEqual(['100% cotton'])
    await save('product_info', { link: { label: 'x', href: 'javascript:alert(1)' } }).expect(400)
    await save('product_info', {}, false).expect(200)
    expect(
      (await http().get('/api/v1/content-blocks/product_info').expect(200)).body.data,
    ).toBeNull() // off → hidden
  })

  describe('picture upload', () => {
    it('a real image is re-encoded, stored under content/ with a random name, and its https address returned', async () => {
      const res = await http()
        .post('/api/v1/admin/content/images')
        .attach('file', await png(), 'my banner.png')
        .expect(201)
      expect(res.body.data.url).toMatch(/^https:\/\/.+\/content\/[0-9a-f-]{36}\.(webp|png|jpg)$/)
      const storage = app.get<MemoryImageStorage>(IMAGE_STORAGE)
      expect([...storage.files.keys()].every((k) => k.startsWith('content/'))).toBe(true)
    })

    it('refused: not an image (whatever its name says), no file, over 5 MB', async () => {
      await http()
        .post('/api/v1/admin/content/images')
        .attach('file', Buffer.from('<?php echo 1; ?>'), {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(415)
      await http().post('/api/v1/admin/content/images').expect(400)
      await http()
        .post('/api/v1/admin/content/images')
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.jpg')
        .expect(413)
    })
  })

  it('the shop’s product list filters by one tag (the homepage product rows)', async () => {
    const c = await makeCategory()
    const eid = await makeProduct({ categoryId: c.id, name: 'Silk Panjabi', tags: ['eid', 'silk'] })
    await makeProduct({ categoryId: c.id, name: 'Chino', tags: ['office'] })
    const ids = (await http().get('/api/v1/products?tag=eid').expect(200)).body.data.items.map(
      (p: { id: string }) => p.id,
    )
    expect(ids).toEqual([eid.id])
    expect((await http().get('/api/v1/products?tag=EID').expect(200)).body.data.items).toEqual([]) // exact, as written
  })

  it('admin-only (the shop’s public read stays open)', async () => {
    const outsider = await createTestApp({ asAdmin: false })
    try {
      const h = () => request(outsider.getHttpServer())
      await h().get('/api/v1/admin/content-blocks').expect(401)
      await h()
        .put('/api/v1/admin/content-blocks/announcement_bar')
        .send({ data: { text: 'x' }, isActive: true })
        .expect(401)
      await h().post('/api/v1/admin/content/images').expect(401)
      await h().delete('/api/v1/admin/content-blocks/announcement_bar').expect(401)
      expect(
        (await h().get('/api/v1/content-blocks/announcement_bar').expect(200)).body.data,
      ).toBeNull() // public: open (nothing saved yet)
    } finally {
      await outsider.close()
    }
  })
})
