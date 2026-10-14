import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import type { Category } from '@nowoll/database'
import { pickUniqueSlug, slugPrefixOf } from '../common/slugs.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  ancestorsOf,
  buildTree,
  compareCategories,
  type TreeNode,
  visibleCategories,
  wouldCreateCycle,
} from './category-tree.js'
import type { CreateCategoryDto } from './dto/create-category.dto.js'
import type { UpdateCategoryDto } from './dto/update-category.dto.js'
import { RedirectsService } from '../redirects/redirects.service.js'

/** What customers see — no admin-only fields like isActive or deletedAt. */
export interface PublicCategory {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  seoTitle: string | null
  seoDescription: string | null
}

export interface PublicCategoryNode extends PublicCategory {
  children: PublicCategoryNode[]
}

/** Admin → Categories (step 36b): every category, hidden ones included. */
export interface AdminCategoryNode {
  id: string
  name: string
  slug: string
  parentId: string | null
  description: string | null
  imageUrl: string | null
  imageAlt: string | null
  sizeGuide: string | null
  seoTitle: string | null
  seoDescription: string | null
  isActive: boolean
  sortOrder: number
  productCount: number
  children: AdminCategoryNode[]
}

export interface AdminArchivedCategory {
  id: string
  name: string
  slug: string
  archivedAt: Date
}

export interface PublicCategoryDetail extends PublicCategory {
  sizeGuide: string | null
  breadcrumb: Pick<PublicCategory, 'id' | 'name' | 'slug'>[] // top level → direct parent
  children: PublicCategory[] // direct, visible subcategories
}

const toPublic = (c: Category): PublicCategory => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  imageUrl: c.imageUrl,
  imageAlt: c.imageAlt,
  seoTitle: c.seoTitle,
  seoDescription: c.seoDescription,
})

const toPublicNode = (node: TreeNode<Category>): PublicCategoryNode => ({
  ...toPublic(node),
  children: node.children.map(toPublicNode),
})

// Fallback when a name produces no usable slug (e.g. written only in Bangla).
const FALLBACK_SLUG = 'category'

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    // Step 43c: old address → new one when the slug changes (optional for hand-built tests).
    @Optional() private readonly redirects?: RedirectsService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────

  /** GET /categories — the nested menu tree, visible categories only. */
  async findTree(): Promise<PublicCategoryNode[]> {
    const rows = await this.loadAll()
    return buildTree(visibleCategories(rows)).map(toPublicNode)
  }

  /**
   * GET /categories/:slug — one visible category with breadcrumb and
   * subcategories, or null. Hidden, archived and unknown all look the same to
   * customers. null (200), not 404: Next.js only caches 200 answers, so a 404
   * would keep a hidden category's page showing on the shop (step 36 lesson).
   */
  async findBySlug(slug: string): Promise<PublicCategoryDetail | null> {
    const visible = visibleCategories(await this.loadAll())
    const category = visible.find((c) => c.slug === slug)
    if (!category) return null

    return {
      ...toPublic(category),
      sizeGuide: category.sizeGuide,
      breadcrumb: ancestorsOf(category.id, visible).map(({ id, name, slug }) => ({
        id,
        name,
        slug,
      })),
      children: visible
        .filter((c) => c.parentId === category.id)
        .sort(compareCategories)
        .map(toPublic),
    }
  }

  // ── Used by the products module ────────────────────────────────────────

  /** Ids of every category a customer may see (active, with active ancestors). */
  async visibleCategoryIds(): Promise<Set<string>> {
    return new Set(visibleCategories(await this.loadAll()).map((c) => c.id))
  }

  /**
   * A visible category and all its visible descendants — so filtering by
   * "Men" also shows products in "Men → Shirts". Null if the slug isn't visible.
   */
  async visibleSubtreeIds(slug: string): Promise<string[] | null> {
    const visible = visibleCategories(await this.loadAll())
    const root = visible.find((c) => c.slug === slug)
    if (!root) return null

    const ids = [root.id]
    for (let i = 0; i < ids.length; i++) {
      for (const c of visible) if (c.parentId === ids[i]) ids.push(c.id)
    }
    return ids
  }

  /** Breadcrumb for a product page: top level → … → the product's own category. */
  async breadcrumbFor(categoryId: string): Promise<Pick<PublicCategory, 'id' | 'name' | 'slug'>[]> {
    const visible = visibleCategories(await this.loadAll())
    const self = visible.find((c) => c.id === categoryId)
    if (!self) return []
    return [...ancestorsOf(categoryId, visible), self].map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    }))
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /** GET /admin/categories — the whole tree, hidden categories included, with product counts. */
  async adminTree(): Promise<AdminCategoryNode[]> {
    const [rows, counts] = await Promise.all([
      this.loadAll(),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ])
    const count = new Map(counts.map((c) => [c.categoryId, c._count._all]))
    const toNode = (n: TreeNode<Category>): AdminCategoryNode => ({
      id: n.id,
      name: n.name,
      slug: n.slug,
      parentId: n.parentId,
      description: n.description,
      imageUrl: n.imageUrl,
      imageAlt: n.imageAlt,
      sizeGuide: n.sizeGuide,
      seoTitle: n.seoTitle,
      seoDescription: n.seoDescription,
      isActive: n.isActive,
      sortOrder: n.sortOrder,
      productCount: count.get(n.id) ?? 0,
      children: n.children.map(toNode),
    })
    return buildTree(rows).map(toNode)
  }

  /** GET /admin/categories?archived=1 — archived categories, newest first. */
  async archived(): Promise<AdminArchivedCategory[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, slug: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    })
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, archivedAt: r.deletedAt! }))
  }

  /**
   * POST /admin/categories/:id/restore — brings an archived category back,
   * HIDDEN (so it never appears on the shop by surprise). If its parent is
   * archived too, it comes back at the top level.
   */
  async restore(id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: { not: null } },
    })
    if (!category) throw new NotFoundException('Archived category not found')
    const parentAlive =
      category.parentId !== null &&
      (await this.prisma.category.count({ where: { id: category.parentId, deletedAt: null } })) > 0
    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: null, isActive: false, parentId: parentAlive ? category.parentId : null },
    })
  }

  /**
   * PATCH /admin/categories/order — the new order of ONE group of sister
   * categories (same parent). The list must be exactly that group, so a
   * stale page can't scramble the order. One transaction: all or nothing.
   */
  async reorder(parentId: string | null, ids: string[]): Promise<{ ids: string[] }> {
    const siblings = await this.prisma.category.findMany({
      where: { parentId, deletedAt: null },
      select: { id: true },
    })
    const current = new Set(siblings.map((s) => s.id))
    if (ids.length !== current.size || !ids.every((id) => current.has(id)))
      throw new ConflictException(
        'The categories changed since this page was loaded. Reload and try again.',
      )
    // Steps of 10 leave room between neighbours.
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } }),
      ),
    )
    return { ids }
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) await this.assertParentUsable(dto.parentId)

    const slug = dto.slug
      ? await this.assertSlugAvailable(dto.slug)
      : await this.generateUniqueSlug(dto.name)

    return this.prisma.category.create({ data: { ...dto, slug } })
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const existing = await this.findActiveOrThrow(id)

    // `undefined` = "don't change the parent"; `null` = "move to top level".
    if (dto.parentId) {
      await this.assertParentUsable(dto.parentId)
      const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } })
      if (wouldCreateCycle(id, dto.parentId, all)) {
        throw new BadRequestException(
          'A category cannot be moved inside itself or its own subcategory.',
        )
      }
    }

    // Renaming does NOT change the slug on purpose: the URL /shop/<slug> may
    // already be in Google, on Facebook posts and in customers' bookmarks.
    // Admins can still change the slug explicitly.
    if (dto.slug && dto.slug !== existing.slug) await this.assertSlugAvailable(dto.slug)

    const updated = await this.prisma.category.update({ where: { id }, data: dto })
    // New address → the old one keeps working (step 43c).
    if (updated.slug !== existing.slug)
      await this.redirects?.moved(`/shop/${existing.slug}`, `/shop/${updated.slug}`)
    return updated
  }

  /**
   * Soft delete (CLAUDE.md §7): the row stays, so old orders and URLs can
   * still be traced, but customers no longer see it.
   * Refused while it still has subcategories or products, so nothing is left
   * pointing at an invisible category — the admin moves them first.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.findActiveOrThrow(id)

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ])
    if (childCount > 0) {
      throw new ConflictException(
        `This category has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. Move or delete them first.`,
      )
    }
    if (productCount > 0) {
      throw new ConflictException(
        `This category has ${productCount} product${productCount === 1 ? '' : 's'}. Move them to another category first.`,
      )
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    })
    return { id }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private loadAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { deletedAt: null } })
  }

  private async findActiveOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } })
    if (!category) throw new NotFoundException('Category not found')
    return category
  }

  private async assertParentUsable(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    })
    if (!parent) throw new BadRequestException('Parent category not found.')
  }

  private async assertSlugAvailable(slug: string): Promise<string> {
    // Archived categories keep their slug (the database's unique index covers
    // every row), so a slug used by an archived category is also unavailable.
    const taken = await this.prisma.category.findUnique({
      where: { slug },
      select: { deletedAt: true },
    })
    if (taken) {
      throw new ConflictException(
        taken.deletedAt
          ? `The slug "${slug}" belongs to an archived category. Choose another.`
          : `The slug "${slug}" is already in use. Choose another.`,
      )
    }
    return slug
  }

  /** "shirts" → "shirts", or "shirts-2", "shirts-3"… if taken. */
  private async generateUniqueSlug(name: string): Promise<string> {
    const existing = await this.prisma.category.findMany({
      where: { slug: { startsWith: slugPrefixOf(name, FALLBACK_SLUG) } },
      select: { slug: true },
    })
    return pickUniqueSlug(name, new Set(existing.map((c) => c.slug)), FALLBACK_SLUG)
  }
}
