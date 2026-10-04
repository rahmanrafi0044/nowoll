// Runs against the REAL test database (nowoll_test), not a mock — so slug
// uniqueness, foreign keys and soft deletes are tested exactly as they'll behave.
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { CategoriesService } from './categories.service.js'

const prisma = testPrisma()
const service = new CategoriesService(prisma as unknown as PrismaService)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

describe('CategoriesService.create', () => {
  it('generates a slug from the name', async () => {
    const c = await service.create({ name: "Men's Shirts" })
    expect(c.slug).toBe('mens-shirts')
  })

  it('adds -2, -3… when the generated slug is taken', async () => {
    await service.create({ name: 'Shirts' })
    const second = await service.create({ name: 'Shirts' })
    const third = await service.create({ name: 'SHIRTS!' })
    expect([second.slug, third.slug]).toEqual(['shirts-2', 'shirts-3'])
  })

  it('falls back to "category" for names with no Latin characters', async () => {
    expect((await service.create({ name: 'পাঞ্জাবি' })).slug).toBe('category')
  })

  it('uses an explicit slug, and rejects one already in use', async () => {
    expect((await service.create({ name: 'Tees', slug: 't-shirts' })).slug).toBe('t-shirts')
    await expect(service.create({ name: 'Other', slug: 't-shirts' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('rejects a slug held by an archived category, with a clear message', async () => {
    const old = await service.create({ name: 'Sale' })
    await service.remove(old.id)
    await expect(service.create({ name: 'Sale', slug: 'sale' })).rejects.toThrow(/archived/)
    // auto-generation simply skips it
    expect((await service.create({ name: 'Sale' })).slug).toBe('sale-2')
  })

  it('rejects a parent that does not exist or is archived', async () => {
    await expect(
      service.create({ name: 'X', parentId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(BadRequestException)

    const archived = await service.create({ name: 'Old' })
    await service.remove(archived.id)
    await expect(service.create({ name: 'X', parentId: archived.id })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

describe('CategoriesService.findTree / findBySlug', () => {
  async function seedTree() {
    const men = await service.create({ name: 'Men', sortOrder: 1 })
    const women = await service.create({ name: 'Women', sortOrder: 2 })
    const shirts = await service.create({ name: 'Shirts', parentId: men.id })
    const formal = await service.create({ name: 'Formal', parentId: shirts.id, sizeGuide: 'S=38' })
    const hidden = await service.create({ name: 'Hidden', parentId: men.id, isActive: false })
    return { men, women, shirts, formal, hidden }
  }

  it('returns the visible tree, nested and ordered', async () => {
    await seedTree()
    const tree = await service.findTree()
    expect(tree.map((n) => n.slug)).toEqual(['men', 'women'])
    expect(tree[0]?.children.map((n) => n.slug)).toEqual(['shirts']) // "hidden" excluded
    expect(tree[0]?.children[0]?.children.map((n) => n.slug)).toEqual(['formal'])
  })

  it('never exposes admin-only fields to customers', async () => {
    await seedTree()
    const [men] = await service.findTree()
    expect(men).not.toHaveProperty('isActive')
    expect(men).not.toHaveProperty('deletedAt')
    expect(men).not.toHaveProperty('sortOrder')
  })

  it('returns a category with breadcrumb, size guide and direct children', async () => {
    await seedTree()
    const formal = await service.findBySlug('formal')
    expect(formal.breadcrumb.map((b) => b.slug)).toEqual(['men', 'shirts'])
    expect(formal.sizeGuide).toBe('S=38')

    const men = await service.findBySlug('men')
    expect(men.children.map((c) => c.slug)).toEqual(['shirts'])
  })

  it('404s for hidden, archived, unknown — and children of hidden parents', async () => {
    const { men } = await seedTree()
    await expect(service.findBySlug('hidden')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.findBySlug('nope')).rejects.toBeInstanceOf(NotFoundException)

    await service.update(men.id, { isActive: false })
    await expect(service.findBySlug('formal')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('CategoriesService.update', () => {
  it('updates fields but keeps the slug when the name changes (protects existing URLs)', async () => {
    const c = await service.create({ name: 'Tshirts' })
    const updated = await service.update(c.id, { name: 'T-Shirts', description: 'Cotton tees' })
    expect(updated).toMatchObject({ name: 'T-Shirts', slug: 'tshirts', description: 'Cotton tees' })
  })

  it('changes the slug when asked, rejecting duplicates', async () => {
    const a = await service.create({ name: 'A' })
    await service.create({ name: 'B' })
    expect((await service.update(a.id, { slug: 'a-new' })).slug).toBe('a-new')
    await expect(service.update(a.id, { slug: 'b' })).rejects.toBeInstanceOf(ConflictException)
    // keeping its own slug is not a conflict
    expect((await service.update(a.id, { slug: 'a-new' })).slug).toBe('a-new')
  })

  it('moves a category to top level with parentId: null', async () => {
    const men = await service.create({ name: 'Men' })
    const shirts = await service.create({ name: 'Shirts', parentId: men.id })
    expect((await service.update(shirts.id, { parentId: null })).parentId).toBeNull()
  })

  it('refuses moves that would create a loop', async () => {
    const men = await service.create({ name: 'Men' })
    const shirts = await service.create({ name: 'Shirts', parentId: men.id })
    await expect(service.update(men.id, { parentId: men.id })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(service.update(men.id, { parentId: shirts.id })).rejects.toThrow(/inside itself/)
  })

  it('404s for an archived or unknown category', async () => {
    const c = await service.create({ name: 'Gone' })
    await service.remove(c.id)
    await expect(service.update(c.id, { name: 'Back' })).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('CategoriesService.remove', () => {
  it('soft-deletes: the row stays, marked deleted and inactive', async () => {
    const c = await service.create({ name: 'Sale' })
    await expect(service.remove(c.id)).resolves.toEqual({ id: c.id })
    const row = await prisma.category.findUnique({ where: { id: c.id } })
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect(row?.isActive).toBe(false)
  })

  it('refuses while subcategories exist', async () => {
    const men = await service.create({ name: 'Men' })
    await service.create({ name: 'Shirts', parentId: men.id })
    await expect(service.remove(men.id)).rejects.toThrow(/1 subcategory/)
  })

  it('refuses while products exist, but allows it once they are archived', async () => {
    const c = await service.create({ name: 'Tees' })
    const product = await prisma.product.create({
      data: {
        name: 'Basic Tee',
        slug: 'basic-tee',
        categoryId: c.id,
        basePrice: new Prisma.Decimal('599'),
      },
    })
    await expect(service.remove(c.id)).rejects.toThrow(/1 product/)

    await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date() } })
    await expect(service.remove(c.id)).resolves.toEqual({ id: c.id })
  })

  it('404s when already deleted', async () => {
    const c = await service.create({ name: 'Once' })
    await service.remove(c.id)
    await expect(service.remove(c.id)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('CategoriesService helpers for products', () => {
  it('returns a visible category with all visible descendants', async () => {
    const men = await service.create({ name: 'Men' })
    const shirts = await service.create({ name: 'Shirts', parentId: men.id })
    const formal = await service.create({ name: 'Formal', parentId: shirts.id })
    await service.create({ name: 'Hidden', parentId: men.id, isActive: false })

    expect(new Set(await service.visibleSubtreeIds('men'))).toEqual(
      new Set([men.id, shirts.id, formal.id]),
    )
    expect(await service.visibleSubtreeIds('hidden')).toBeNull()
  })

  it('builds a breadcrumb ending with the category itself', async () => {
    const men = await service.create({ name: 'Men' })
    const shirts = await service.create({ name: 'Shirts', parentId: men.id })
    expect((await service.breadcrumbFor(shirts.id)).map((c) => c.slug)).toEqual(['men', 'shirts'])
  })
})
