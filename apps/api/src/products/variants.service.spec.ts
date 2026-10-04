import { ConflictException, NotFoundException } from '@nestjs/common'
import { makeCategory, makeProduct } from '../../test/utils/factories.js'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import { CategoriesService } from '../categories/categories.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { ProductsService } from './products.service.js'
import { VariantsService } from './variants.service.js'

const prisma = testPrisma() as unknown as PrismaService
const service = new VariantsService(
  prisma,
  new ProductsService(prisma, new CategoriesService(prisma)),
)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

async function draftProduct() {
  const c = await makeCategory()
  return makeProduct({ categoryId: c.id, status: 'DRAFT', variants: [], basePrice: '1000' })
}

describe('VariantsService.create', () => {
  it('creates a variant and logs its starting stock', async () => {
    const p = await draftProduct()
    const v = await service.create(p.id, { sku: 'TEE-M-BLK', size: 'M', color: 'Black', stock: 7 })
    expect(v).toMatchObject({ sku: 'TEE-M-BLK', stock: 7 })
    expect(await prisma.inventoryLog.findMany()).toEqual([
      expect.objectContaining({ variantId: v.id, change: 7, reason: 'INITIAL_STOCK' }),
    ])
  })

  it('rejects the same size/color twice (ignoring capitals) and a taken SKU', async () => {
    const p = await draftProduct()
    await service.create(p.id, { sku: 'A', size: 'M', color: 'Black' })
    await expect(
      service.create(p.id, { sku: 'B', size: 'm', color: 'black' }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(service.create(p.id, { sku: 'A', size: 'L', color: 'Black' })).rejects.toThrow(
      /SKU already in use/,
    )
  })

  it('rejects a compare-at price below the variant price', async () => {
    const p = await draftProduct()
    await expect(
      service.create(p.id, {
        sku: 'X',
        size: 'M',
        color: 'Red',
        price: 1500,
        compareAtPrice: 1400,
      }),
    ).rejects.toThrow(/must be higher/)
  })

  it('restores an archived variant with the same size/color, logging any stock change', async () => {
    const p = await draftProduct()
    const original = await service.create(p.id, { sku: 'OLD', size: 'M', color: 'Black', stock: 2 })
    await service.remove(original.id)

    const restored = await service.create(p.id, { sku: 'NEW', size: 'M', color: 'Black', stock: 5 })
    expect(restored).toMatchObject({
      id: original.id,
      sku: 'NEW',
      stock: 5,
      isActive: true,
      deletedAt: null,
    })
    const logs = await prisma.inventoryLog.findMany({ orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => [l.reason, l.change, l.stockAfter])).toEqual([
      ['INITIAL_STOCK', 2, 2],
      ['MANUAL_ADJUSTMENT', 3, 5],
    ])
  })

  it('404s for an unknown or archived product', async () => {
    await expect(
      service.create('00000000-0000-0000-0000-000000000000', { sku: 'X', size: 'M', color: 'Red' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('VariantsService.update', () => {
  it('updates fields and clears a price override with null', async () => {
    const p = await draftProduct()
    const v = await service.create(p.id, { sku: 'A', size: 'M', color: 'Black', price: 1100 })
    const updated = await service.update(v.id, { colorHex: '#000000', price: null })
    expect(updated.colorHex).toBe('#000000')
    expect(updated.price).toBeNull()
  })

  it('refuses to rename into an existing size/color', async () => {
    const p = await draftProduct()
    await service.create(p.id, { sku: 'A', size: 'M', color: 'Black' })
    const l = await service.create(p.id, { sku: 'B', size: 'L', color: 'Black' })
    await expect(service.update(l.id, { size: 'M' })).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses to deactivate the last variant of a published product — and changes nothing', async () => {
    const c = await makeCategory()
    const p = await makeProduct({ categoryId: c.id, variants: [{ size: 'M', color: 'Black' }] })
    const only = p.variants[0]!
    await expect(service.update(only.id, { isActive: false })).rejects.toThrow(
      /needs an active variant/,
    )
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: only.id } })).isActive,
    ).toBe(true)
  })
})

describe('VariantsService.remove', () => {
  it('soft-deletes', async () => {
    const p = await draftProduct()
    const v = await service.create(p.id, { sku: 'A', size: 'M', color: 'Black' })
    await service.remove(v.id)
    const row = await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })
    expect(row.deletedAt).toBeInstanceOf(Date)
    await expect(service.remove(v.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses to remove the last variant of a published product, but allows others', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'M', color: 'Black' },
        { size: 'L', color: 'Black' },
      ],
    })
    await service.remove(p.variants[0]!.id)
    await expect(service.remove(p.variants[1]!.id)).rejects.toBeInstanceOf(ConflictException)
    expect(await prisma.productVariant.count({ where: { deletedAt: null } })).toBe(1)
  })
})

describe('VariantsService.listForProduct', () => {
  it('lists live variants of a visible product; 404 for drafts', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'M', color: 'Black' },
        { size: 'L', color: 'Black', isActive: false },
      ],
    })
    expect((await service.listForProduct(p.id)).map((v) => v.size)).toEqual(['M'])

    const draft = await makeProduct({ categoryId: c.id, status: 'DRAFT' })
    await expect(service.listForProduct(draft.id)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('variant ordering', () => {
  it('appends new variants after existing ones', async () => {
    const c = await makeCategory()
    const p = await makeProduct({
      categoryId: c.id,
      variants: [
        { size: 'S', color: 'Black' },
        { size: 'M', color: 'Black' },
      ],
    })
    const xl = await service.create(p.id, { sku: 'XL', size: 'XL', color: 'Black' })
    expect(xl.sortOrder).toBe(2)
    expect((await service.listForProduct(p.id)).map((v) => v.size)).toEqual(['S', 'M', 'XL'])
  })
})
