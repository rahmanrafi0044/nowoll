import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import type {
  AdminBlogDetail,
  AdminBlogRow,
  BlogCardView,
  BlogListView,
  BlogPostView,
  BlogSitemapEntry,
} from '@nowoll/types'
import type { ProductCard } from '../products/products.service.js'
import { blogInputSchema, blogPhotoProblem, blogTagSchema } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'
import { ProductsService } from '../products/products.service.js'
import { RedirectsService } from '../redirects/redirects.service.js'
import { IMAGE_STORAGE, type ImageStorage } from '../storage/image-storage.js'
import { PAGE_SIZE, type SaveBlogPostDto } from './dto/blog.dto.js'

// ============================================================================
// Blog (step 43). A post is LIVE when it is PUBLISHED and its publish date
// has come — so a post can be scheduled. Archiving is a SOFT delete (status
// ARCHIVED): the post leaves the shop but stays restorable with its address.
// Public answers are 200 + null for a missing post (Next.js only caches 200
// answers — the step 36 lesson), never a 404.
// ============================================================================

/** The Prisma filter for "live right now". */
const live = (now: Date): Prisma.BlogPostWhereInput => ({
  status: 'PUBLISHED',
  publishedAt: { lte: now },
  deletedAt: null,
})

const CARD = {
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  coverImageAlt: true,
  tags: true,
  publishedAt: true,
} satisfies Prisma.BlogPostSelect

type CardRow = Prisma.BlogPostGetPayload<{ select: typeof CARD }>

/** A live post as the API sends it (product prices are exact Decimals until JSON). */
export type BlogPost = Omit<BlogPostView, 'products'> & { products: ProductCard[] }
const toCard = (p: CardRow): BlogCardView => ({ ...p, publishedAt: p.publishedAt!.toISOString() })

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    // Step 43c: old address → new one when the slug changes (optional for hand-built tests).
    @Optional() private readonly redirects?: RedirectsService,
  ) {}

  // ── Shop ─────────────────────────────────────────────────────────────────

  async list(page: number, tag: string | undefined, now = new Date()): Promise<BlogListView> {
    const cleanTag = tag ? blogTagSchema.safeParse(tag).data : undefined
    if (tag && !cleanTag)
      return { items: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0, tag: null }
    const where = { ...live(now), ...(cleanTag && { tags: { has: cleanTag } }) }
    const [total, rows] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: CARD,
      }),
    ])
    return {
      items: rows.map(toCard),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
      tag: cleanTag ?? null,
    }
  }

  async findLive(slug: string, now = new Date()): Promise<BlogPost | null> {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, ...live(now) },
      select: {
        ...CARD,
        content: true,
        seoTitle: true,
        seoDescription: true,
        updatedAt: true,
        products: { orderBy: { sortOrder: 'asc' }, select: { productId: true } },
      },
    })
    if (!post) return null
    const { products, updatedAt, ...rest } = post
    return {
      ...toCard(rest),
      content: rest.content,
      seoTitle: rest.seoTitle,
      seoDescription: rest.seoDescription,
      updatedAt: updatedAt.toISOString(),
      // Only products the shop shows right now — a hidden one just drops out.
      products: await this.products.cardsByIds(products.map((p) => p.productId)),
    }
  }

  async sitemap(now = new Date()): Promise<BlogSitemapEntry[]> {
    const rows = await this.prisma.blogPost.findMany({
      where: live(now),
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, updatedAt: true },
    })
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }))
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(status?: AdminBlogRow['status'], now = new Date()): Promise<AdminBlogRow[]> {
    const rows = await this.prisma.blogPost.findMany({
      where: status ? { status } : { status: { in: ['DRAFT', 'PUBLISHED'] } },
      orderBy: [{ updatedAt: 'desc' }],
    })
    return rows.map((r) => toRow(r, now))
  }

  async detail(id: string, now = new Date()): Promise<AdminBlogDetail> {
    const p = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { products: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!p) throw new NotFoundException('Post not found')
    return {
      ...toRow(p, now),
      excerpt: p.excerpt,
      content: p.content,
      coverImageUrl: p.coverImageUrl,
      coverImageAlt: p.coverImageAlt,
      tags: p.tags,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      productIds: p.products.map((x) => x.productId),
    }
  }

  async create(dto: SaveBlogPostDto, authorId: string | null): Promise<AdminBlogDetail> {
    const input = await this.check(dto)
    await this.slugFree(input.slug)
    const status = dto.status ?? 'DRAFT'
    const post = await this.prisma.blogPost.create({
      data: {
        ...fields(input),
        status,
        publishedAt: publishDate(status, dto.publishedAt, null),
        authorId,
        products: { create: input.productIds.map((productId, i) => ({ productId, sortOrder: i })) },
      },
    })
    return this.detail(post.id)
  }

  async update(id: string, dto: SaveBlogPostDto): Promise<AdminBlogDetail> {
    const current = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Post not found')
    const input = await this.check(dto)
    if (input.slug !== current.slug) await this.slugFree(input.slug, id)
    const status = dto.status ?? (current.status === 'ARCHIVED' ? 'DRAFT' : current.status)
    await this.prisma.$transaction([
      this.prisma.blogPostProduct.deleteMany({ where: { postId: id } }),
      this.prisma.blogPost.update({
        where: { id },
        data: {
          ...fields(input),
          status,
          deletedAt: null,
          publishedAt: publishDate(status, dto.publishedAt, current.publishedAt),
          products: {
            create: input.productIds.map((productId, i) => ({ productId, sortOrder: i })),
          },
        },
      }),
    ])
    // New address → the old one keeps working (step 43c), e.g. links shared on Facebook.
    if (input.slug !== current.slug)
      await this.redirects?.moved(`/blog/${current.slug}`, `/blog/${input.slug}`)
    return this.detail(id)
  }

  /** Soft delete: leaves the shop, stays restorable (and keeps its address). */
  async archive(id: string): Promise<AdminBlogDetail> {
    const current = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Post not found')
    await this.prisma.blogPost.update({ where: { id }, data: { status: 'ARCHIVED' } })
    return this.detail(id)
  }

  /** The shared rules + "photos only from our own uploads" + products that exist. */
  private async check(dto: SaveBlogPostDto) {
    const parsed = blogInputSchema.safeParse(dto)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Some fields need fixing.',
        details: parsed.error.issues.map((i) => i.message),
      })
    const ownPrefix = this.storage.publicUrl('content/x').slice(0, -1)
    const photo = blogPhotoProblem(parsed.data, ownPrefix)
    if (photo) throw new BadRequestException({ message: photo, details: [photo] })
    if (parsed.data.productIds.length) {
      const found = await this.prisma.product.count({
        where: { id: { in: parsed.data.productIds }, deletedAt: null },
      })
      if (found !== parsed.data.productIds.length)
        throw new BadRequestException({
          message: 'A chosen product no longer exists.',
          details: ['Choose the products again.'],
        })
    }
    return parsed.data
  }

  private async slugFree(slug: string, exceptId?: string) {
    const taken = await this.prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })
    if (taken && taken.id !== exceptId)
      throw new ConflictException({
        message: 'Another post already uses this web address — choose another.',
        code: 'SLUG_TAKEN',
      })
  }
}

function fields(input: ReturnType<typeof blogInputSchema.parse>) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    content: input.content,
    coverImageUrl: input.coverImageUrl,
    coverImageAlt: input.coverImageUrl ? input.coverImageAlt : null,
    tags: input.tags,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  }
}

/**
 * The publish date: what the admin chose; or, when publishing without one,
 * the date it already had, else now. A draft keeps any planned date.
 */
function publishDate(
  status: 'DRAFT' | 'PUBLISHED',
  chosen: string | null | undefined,
  existing: Date | null,
): Date | null {
  if (chosen) return new Date(chosen)
  if (chosen === null) return status === 'PUBLISHED' ? new Date() : null
  if (status === 'PUBLISHED') return existing ?? new Date()
  return existing
}

function toRow(
  p: {
    id: string
    slug: string
    title: string
    status: AdminBlogRow['status']
    publishedAt: Date | null
    updatedAt: Date
  },
  now: Date,
): AdminBlogRow {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    scheduled: p.status === 'PUBLISHED' && !!p.publishedAt && p.publishedAt > now,
    updatedAt: p.updatedAt.toISOString(),
  }
}
