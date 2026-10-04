// Real-database tests (nowoll_test) for ProductsService.
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { makeCategory, makeProduct } from '../../test/utils/factories.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import { CategoriesService } from '../categories/categories.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { ListProductsQuery } from './dto/list-products.query.js'
import { ProductsService } from './products.service.js'

const prisma = testPrisma() as unknown as PrismaService
const service = new ProductsService(prisma, new CategoriesService(prisma))
const list = (q: Partial<ListProductsQuery> = {}) => service.list({ page: 1, pageSize: 24, ...q })
const slugsOf = async (q: Partial<ListProductsQuery> = {}) =>
  (await list(q)).items.map((p) => p.name)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

describe('ProductsService.create', () => {
  it('creates a DRAFT product with variants, a slug and starting-stock log entries', async () => {
    const category = await makeCategory()
    const product = await service.create({
      name: 'Oxford Shirt',
      categoryId: category.id,
      basePrice: 1499.5,
      tags: ['formal'],
      variants: [
        { sku: 'OXF-M', size: 'M', color: 'Blue', stock: 10 },
        { sku: 'OXF-L', size: 'L', color: 'Blue' }, // no stock → no log entry
      ],
    })

    expect(product).toMatchObject({ slug: 'oxford-shirt', status: 'DRAFT' })
    expect(product.basePrice.toString()).toBe('1499.5')
    const logs = await prisma.inventoryLog.findMany()
    expect(logs).toEqual([
      expect.objectContaining({ change: 10, stockAfter: 10, reason: 'INITIAL_STOCK' }),
    ])
  })

  it('rejects an unknown category, a misleading compare-at price and duplicate variants', async () => {
    const category = await makeCategory()
    const base = { name: 'X', categoryId: category.id, basePrice: 1000 }

    await expect(
      service.create({ ...base, categoryId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.create({ ...base, compareAtPrice: 900 })).rejects.toThrow(/must be higher/)
    await expect(
      service.create({
        ...base,
        variants: [
          { sku: 'A', size: 'M', color: 'Blue' },
          { sku: 'B', size: 'm', color: 'BLUE' },
        ],
      }),
    ).rejects.toThrow(/Duplicate variant/)
  })

  it('rejects a SKU used by any other product', async () => {
    const category = await makeCategory()
    await service.create({
      name: 'A',
      categoryId: category.id,
      basePrice: 1,
      variants: [{ sku: 'DUP', size: 'M', color: 'Red' }],
    })
    await expect(
      service.create({
        name: 'B',
        categoryId: category.id,
        basePrice: 1,
        variants: [{ sku: 'DUP', size: 'S', color: 'Red' }],
      }),
    ).rejects.toThrow(/SKU already in use: DUP/)
    expect(await prisma.product.count()).toBe(1) // nothing half-saved
  })
})

describe('ProductsService.update — publishing rule', () => {
  it('refuses to publish without an active variant and an image', async () => {
    const category = await makeCategory()
    const bare = await makeProduct({
      categoryId: category.id,
      status: 'DRAFT',
      variants: [],
      withImage: false,
    })
    await expect(service.update(bare.id, { status: 'ACTIVE' })).rejects.toThrow(
      /needs an active variant and an image/,
    )

    const noImage = await makeProduct({
      categoryId: category.id,
      status: 'DRAFT',
      withImage: false,
    })
    await expect(service.update(noImage.id, { status: 'ACTIVE' })).rejects.toThrow(/needs an image/)
  })

  it('publishes once both exist', async () => {
    const category = await makeCategory()
    const ready = await makeProduct({ categoryId: category.id, status: 'DRAFT' })
    expect((await service.update(ready.id, { status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('checks compare-at against the stored price when only one of them changes', async () => {
    const category = await makeCategory()
    const p = await makeProduct({ categoryId: category.id, basePrice: '1000' })
    await expect(service.update(p.id, { compareAtPrice: 999 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect((await service.update(p.id, { compareAtPrice: 1200 })).compareAtPrice?.toString()).toBe(
      '1200',
    )
  })
})

describe('ProductsService.remove', () => {
  it('archives the product and hides it from customers', async () => {
    const category = await makeCategory()
    const p = await makeProduct({ categoryId: category.id, name: 'Gone' })
    await service.remove(p.id)
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(row).toMatchObject({ status: 'ARCHIVED', isFeatured: false })
    expect(row.deletedAt).toBeInstanceOf(Date)
    await expect(service.findBySlug(p.slug)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove(p.id)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('ProductsService.list — visibility', () => {
  it('shows only ACTIVE products in visible categories', async () => {
    const visible = await makeCategory()
    const hidden = await makeCategory({ isActive: false })
    await makeProduct({ categoryId: visible.id, name: 'Shown' })
    await makeProduct({ categoryId: visible.id, name: 'Draft', status: 'DRAFT' })
    await makeProduct({ categoryId: visible.id, name: 'Archived', status: 'ARCHIVED' })
    await makeProduct({ categoryId: hidden.id, name: 'In hidden category' })
    expect(await slugsOf()).toEqual(['Shown'])
  })

  it('filters by category including subcategories', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    const women = await makeCategory({ name: 'Women' })
    await makeProduct({ categoryId: men.id, name: 'Men item' })
    await makeProduct({ categoryId: shirts.id, name: 'Shirt item' })
    await makeProduct({ categoryId: women.id, name: 'Women item' })

    expect(new Set(await slugsOf({ category: men.slug }))).toEqual(
      new Set(['Men item', 'Shirt item']),
    )
    expect(await slugsOf({ category: 'no-such-category' })).toEqual([])
  })
})

describe('ProductsService.list — search', () => {
  it('finds by name, tags and description with stemming, best matches first', async () => {
    const c = await makeCategory()
    await makeProduct({
      categoryId: c.id,
      name: 'Denim Jeans',
      description: 'Pairs well with a shirt',
    })
    await makeProduct({ categoryId: c.id, name: 'Oxford Shirt' })
    await makeProduct({ categoryId: c.id, name: 'Linen Panjabi', tags: ['eid'] })

    expect(await slugsOf({ q: 'shirts' })).toEqual(['Oxford Shirt', 'Denim Jeans'])
    expect(await slugsOf({ q: 'eid' })).toEqual(['Linen Panjabi'])
    expect(await slugsOf({ q: 'shirt -jeans' })).toEqual(['Oxford Shirt'])
    expect(await slugsOf({ q: 'tuxedo' })).toEqual([])
  })

  it('treats odd input safely', async () => {
    const c = await makeCategory()
    await makeProduct({ categoryId: c.id, name: 'Tee' })
    for (const q of ["'; DROP TABLE products; --", '"unclosed', '&&||!!', '()']) {
      await expect(list({ q })).resolves.toBeDefined()
    }
    expect(await prisma.product.count()).toBe(1)
  })
})

describe('ProductsService.list — filters, sorting, paging', () => {
  async function seed() {
    const c = await makeCategory()
    await makeProduct({
      categoryId: c.id,
      name: 'Cheap',
      basePrice: '500',
      createdAt: new Date('2026-01-01'),
      variants: [
        { size: 'M', color: 'Blue', stock: 0 },
        { size: 'L', color: 'Red', stock: 3 },
      ],
    })
    await makeProduct({
      categoryId: c.id,
      name: 'Mid',
      basePrice: '1500',
      isFeatured: true,
      createdAt: new Date('2026-02-01'),
      variants: [{ size: 'M', color: 'Blue', stock: 2 }],
    })
    await makeProduct({
      categoryId: c.id,
      name: 'Pricey',
      basePrice: '3000',
      createdAt: new Date('2026-03-01'),
      variants: [{ size: 'S', color: 'Black', stock: 0 }],
    })
  }

  it('sorts newest first by default, and by price either way', async () => {
    await seed()
    expect(await slugsOf()).toEqual(['Pricey', 'Mid', 'Cheap'])
    expect(await slugsOf({ sort: 'price_asc' })).toEqual(['Cheap', 'Mid', 'Pricey'])
    expect(await slugsOf({ sort: 'price_desc' })).toEqual(['Pricey', 'Mid', 'Cheap'])
  })

  it('filters by price range, featured and stock', async () => {
    await seed()
    expect(await slugsOf({ minPrice: 1000, maxPrice: 2000 })).toEqual(['Mid'])
    expect(await slugsOf({ featured: true })).toEqual(['Mid'])
    expect(await slugsOf({ inStock: true })).toEqual(['Mid', 'Cheap'])
  })

  it('matches size + color + stock on the SAME variant', async () => {
    await seed()
    // "Cheap" has an M/Blue (out of stock) and an L/Red (in stock) → not "M Blue in stock"
    expect(await slugsOf({ size: 'm', color: 'blue', inStock: true })).toEqual(['Mid'])
    expect(await slugsOf({ size: 'M', color: 'Blue' })).toEqual(['Mid', 'Cheap'])
  })

  it('paginates with correct totals', async () => {
    await seed()
    const page1 = await list({ pageSize: 2, page: 1 })
    const page2 = await list({ pageSize: 2, page: 2 })
    expect(page1).toMatchObject({ total: 3, totalPages: 2, page: 1 })
    expect([...page1.items, ...page2.items].map((p) => p.name)).toEqual(['Pricey', 'Mid', 'Cheap'])
  })

  it('builds cards with image, colors, sizes and stock flag', async () => {
    await seed()
    const cheap = (await list()).items.find((p) => p.name === 'Cheap')
    expect(cheap).toMatchObject({
      colors: [
        { color: 'Blue', colorHex: null },
        { color: 'Red', colorHex: null },
      ],
      sizes: ['M', 'L'],
      inStock: true,
      image: expect.objectContaining({ altText: 'Cheap photo' }),
    })
  })
})

describe('ProductsService.findBySlug', () => {
  it('returns variant prices, stock flags and the breadcrumb — never exact stock', async () => {
    const men = await makeCategory({ name: 'Men' })
    const shirts = await makeCategory({ name: 'Shirts', parentId: men.id })
    const p = await makeProduct({
      categoryId: shirts.id,
      basePrice: '1000',
      compareAtPrice: '1200',
      variants: [
        { size: 'M', color: 'Blue', stock: 4 },
        { size: 'XXL', color: 'Blue', stock: 0, price: '1100' },
        { size: 'S', color: 'Blue', isActive: false },
      ],
    })

    const detail = await service.findBySlug(p.slug)
    expect(detail.breadcrumb.map((b) => b.name)).toEqual(['Men', 'Shirts'])
    expect(
      detail.variants.map((v) => [
        v.size,
        v.price.toString(),
        v.compareAtPrice?.toString() ?? null,
        v.inStock,
      ]),
    ).toEqual([
      ['M', '1000', '1200', true],
      ['XXL', '1100', null, false],
    ])
    expect(detail.variants[0]).not.toHaveProperty('stock')
  })

  it('404s for drafts', async () => {
    const c = await makeCategory()
    const draft = await makeProduct({ categoryId: c.id, status: 'DRAFT' })
    await expect(service.findBySlug(draft.slug)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('ProductsService slugs', () => {
  it('keeps the slug on rename and rejects a taken slug', async () => {
    const c = await makeCategory()
    const a = await service.create({ name: 'Tee', categoryId: c.id, basePrice: 500 })
    await service.create({ name: 'Polo', categoryId: c.id, basePrice: 500 })
    expect((await service.update(a.id, { name: 'Basic Tee' })).slug).toBe('tee')
    await expect(service.update(a.id, { slug: 'polo' })).rejects.toBeInstanceOf(ConflictException)
  })
})
