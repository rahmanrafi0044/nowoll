import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import type { Page } from '@nowoll/database'
import { pageInputSchema, pageSlugSchema } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreatePageDto } from './dto/create-page.dto.js'
import type { UpdatePageDto } from './dto/update-page.dto.js'
import { STARTER_PAGES } from './starter-pages.js'
import { RedirectsService } from '../redirects/redirects.service.js'

export type PageStatus = Page['status']

export interface PageLink {
  slug: string
  title: string
}

export interface PublicPage {
  slug: string
  title: string
  content: string
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: Date
}

export interface AdminPageRow {
  id: string
  slug: string
  title: string
  status: PageStatus
  createdAt: Date
  updatedAt: Date
}

export interface AdminPageDetail extends AdminPageRow {
  content: string
  seoTitle: string | null
  seoDescription: string | null
}

const ROW = { id: true, slug: true, title: true, status: true, createdAt: true, updatedAt: true }

/**
 * Static pages (step 36 part 2). Archiving is a SOFT delete (status ARCHIVED):
 * the page leaves the shop but stays restorable, and keeps its address.
 */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    // Step 43c: old address → new one when the slug changes (optional for hand-built tests).
    @Optional() private readonly redirects?: RedirectsService,
  ) {}

  // ── Shop ─────────────────────────────────────────────────────────────────

  /** GET /pages — published pages for the footer, oldest first (the starter order). */
  listPublished(): Promise<PageLink[]> {
    return this.prisma.page.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, title: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * GET /pages/:slug — a PUBLISHED page, or null (draft, archived, unknown).
   * null (200), not 404: Next.js only caches 200 answers, so a 404 would leave
   * an unpublished page showing on the shop (the step 36 announcement-bar lesson).
   */
  async findPublished(slug: string): Promise<PublicPage | null> {
    if (!pageSlugSchema.safeParse(slug).success) return null
    return this.prisma.page.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        slug: true,
        title: true,
        content: true,
        seoTitle: true,
        seoDescription: true,
        updatedAt: true,
      },
    })
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  list(status?: PageStatus): Promise<AdminPageRow[]> {
    return this.prisma.page.findMany({
      where: status ? { status } : { status: { not: 'ARCHIVED' } },
      select: ROW,
      orderBy: { createdAt: 'asc' },
    })
  }

  async detail(id: string): Promise<AdminPageDetail> {
    const page = await this.prisma.page.findUnique({
      where: { id },
      select: { ...ROW, content: true, seoTitle: true, seoDescription: true },
    })
    if (!page) throw new NotFoundException('Page not found')
    return page
  }

  async create(dto: CreatePageDto): Promise<AdminPageDetail> {
    const input = this.check(dto)
    await this.slugFree(input.slug)
    const page = await this.prisma.page.create({
      data: { ...input, status: dto.status ?? 'DRAFT' },
    })
    return this.detail(page.id)
  }

  /** Edits any fields; status DRAFT/PUBLISHED publishes, unpublishes or restores. */
  async update(id: string, dto: UpdatePageDto): Promise<AdminPageDetail> {
    const current = await this.detail(id)
    // The whole page must still fit the rules after the change.
    const input = this.check({
      title: dto.title ?? current.title,
      slug: dto.slug ?? current.slug,
      content: dto.content ?? current.content,
      seoTitle: dto.seoTitle !== undefined ? dto.seoTitle : current.seoTitle,
      seoDescription:
        dto.seoDescription !== undefined ? dto.seoDescription : current.seoDescription,
    })
    if (input.slug !== current.slug) await this.slugFree(input.slug)
    await this.prisma.page.update({
      where: { id },
      data: { ...input, ...(dto.status && { status: dto.status }) },
    })
    // New address → the old one keeps working (step 43c).
    if (input.slug !== current.slug)
      await this.redirects?.moved(`/${current.slug}`, `/${input.slug}`)
    return this.detail(id)
  }

  /** DELETE — archive (soft): hidden from the shop, restorable. */
  async archive(id: string): Promise<AdminPageDetail> {
    await this.detail(id)
    await this.prisma.page.update({ where: { id }, data: { status: 'ARCHIVED' } })
    return this.detail(id)
  }

  /**
   * POST /admin/pages/starter — adds the six starter pages as DRAFTS. An address
   * already in use (even by an archived page) is skipped, so pressing it twice
   * never duplicates or overwrites anything.
   */
  async addStarters(): Promise<{ created: string[] }> {
    const taken = new Set(
      (await this.prisma.page.findMany({ select: { slug: true } })).map((p) => p.slug),
    )
    const created: string[] = []
    // One by one, in order: createdAt gives the footer its order.
    for (const p of STARTER_PAGES) {
      if (taken.has(p.slug)) continue
      await this.prisma.page.create({ data: { ...p, status: 'DRAFT' } })
      created.push(p.slug)
    }
    return { created }
  }

  private check(data: unknown) {
    const parsed = pageInputSchema.safeParse(data)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Some fields need fixing — see the list.',
        code: 'INVALID_PAGE',
        details: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join(' › ')}: ${i.message}` : i.message,
        ),
      })
    return parsed.data
  }

  private async slugFree(slug: string) {
    const other = await this.prisma.page.findUnique({ where: { slug }, select: { status: true } })
    if (other)
      throw new ConflictException({
        code: 'SLUG_TAKEN',
        message:
          other.status === 'ARCHIVED'
            ? `An archived page already uses /${slug}. Restore that page, or choose another address.`
            : `Another page already uses /${slug}. Choose another address.`,
      })
  }
}
