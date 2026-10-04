import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Category } from '@nowoll/database'
import { SLUG_MAX_LENGTH, slugify } from '@nowoll/validation'
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
  constructor(private readonly prisma: PrismaService) {}

  // ── Public ─────────────────────────────────────────────────────────────

  /** GET /categories — the nested menu tree, visible categories only. */
  async findTree(): Promise<PublicCategoryNode[]> {
    const rows = await this.loadAll()
    return buildTree(visibleCategories(rows)).map(toPublicNode)
  }

  /** GET /categories/:slug — one visible category with breadcrumb and subcategories. */
  async findBySlug(slug: string): Promise<PublicCategoryDetail> {
    const visible = visibleCategories(await this.loadAll())
    const category = visible.find((c) => c.slug === slug)
    // Hidden, archived and non-existent all look the same to customers: 404.
    if (!category) throw new NotFoundException('Category not found')

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

  // ── Admin ──────────────────────────────────────────────────────────────

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

    return this.prisma.category.update({ where: { id }, data: dto })
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
    const base = slugify(name) || FALLBACK_SLUG
    const existing = await this.prisma.category.findMany({
      where: { slug: { startsWith: base.slice(0, SLUG_MAX_LENGTH - 6) } },
      select: { slug: true },
    })
    const taken = new Set(existing.map((c) => c.slug))
    if (!taken.has(base)) return base

    for (let n = 2; ; n++) {
      const suffix = `-${n}`
      const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
      if (!taken.has(candidate)) return candidate
    }
  }
}
