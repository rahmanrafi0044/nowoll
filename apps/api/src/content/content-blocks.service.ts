import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { CONTENT_BLOCK_SCHEMAS, type ContentBlockKey, readHomepageLayout } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'

const isKnownKey = (key: string): key is ContentBlockKey => key in CONTENT_BLOCK_SCHEMAS

/** One block as the admin editor sees it (step 36). */
export interface AdminContentBlock {
  key: ContentBlockKey
  /** What is saved (null = never saved, or cleared: the storefront uses its default). */
  data: unknown
  isActive: boolean
  /** Does the saved data fit its format? (false = hidden on the storefront) */
  valid: boolean
  updatedAt: Date | null
}

@Injectable()
export class ContentBlocksService {
  private readonly logger = new Logger(ContentBlocksService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /content-blocks/:key — an ACTIVE block from the allow-list, checked
   * against its schema. Inactive, cleared, never-saved and invalid blocks
   * answer 200 with data null ("nothing to show") so the storefront hides
   * that section. NOT 404: Next.js only caches 200 answers, so a 404 would
   * leave the shop showing its last cached copy — e.g. a removed announcement
   * bar stayed up. Only keys outside the allow-list answer 404.
   * (homepage_layout is checked SECTION BY SECTION — one broken section hides
   * only itself — see readHomepageLayout.)
   */
  async findActive(key: string): Promise<{ key: string; data: unknown } | null> {
    if (!isKnownKey(key)) throw new NotFoundException('Content not found')

    const block = await this.prisma.contentBlock.findUnique({ where: { key } })
    if (!block || !block.isActive) return null

    if (key === 'homepage_layout') return { key, data: readHomepageLayout(block.data) }
    const parsed = CONTENT_BLOCK_SCHEMAS[key].safeParse(block.data)
    if (!parsed.success) {
      this.logger.warn(
        `Content block "${key}" has invalid data — hidden. Fix it in Admin → Content.`,
      )
      return null
    }
    return { key, data: parsed.data }
  }

  // ── Admin (step 36) ──────────────────────────────────────────────────────

  /** GET /admin/content-blocks — every editable block, saved or not. */
  async listForAdmin(): Promise<AdminContentBlock[]> {
    const keys = Object.keys(CONTENT_BLOCK_SCHEMAS) as ContentBlockKey[]
    const rows = await this.prisma.contentBlock.findMany({ where: { key: { in: keys } } })
    return keys.map((key) => {
      const row = rows.find((r) => r.key === key)
      return {
        key,
        data: row?.data ?? null,
        isActive: row?.isActive ?? false,
        // A cleared block (data null) is "nothing here", not "broken".
        valid: !row || row.data === null || CONTENT_BLOCK_SCHEMAS[key].safeParse(row.data).success,
        updatedAt: row?.updatedAt ?? null,
      }
    })
  }

  async getForAdmin(key: string): Promise<AdminContentBlock> {
    if (!isKnownKey(key)) throw new NotFoundException('Content not found')
    return (await this.listForAdmin()).find((b) => b.key === key)!
  }

  /**
   * PUT /admin/content-blocks/:key — saves a block. The data must fit the
   * block's format EXACTLY (the API is the gatekeeper — a hand-made request
   * can't store a javascript: link or an unknown section type). What is
   * stored is the parsed, cleaned value (trimmed, defaults filled in).
   */
  async save(key: string, data: unknown, isActive: boolean): Promise<AdminContentBlock> {
    if (!isKnownKey(key)) throw new NotFoundException('Content not found')
    const parsed = CONTENT_BLOCK_SCHEMAS[key].safeParse(data)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Some of this content isn’t allowed — see the list.',
        code: 'INVALID_CONTENT',
        details: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join(' › ')}: ${i.message}` : i.message,
        ),
      })
    const value = parsed.data as Prisma.InputJsonValue
    await this.prisma.contentBlock.upsert({
      where: { key },
      create: { key, data: value, isActive },
      update: { data: value, isActive },
    })
    return this.getForAdmin(key)
  }

  /**
   * DELETE /admin/content-blocks/:key — empties a block and switches it off
   * (e.g. "remove the announcement"). A SOFT clear (CLAUDE.md §7): the row is
   * kept with no content, so the storefront falls back to its default
   * (for the announcement bar: no bar at all).
   */
  async clear(key: string): Promise<AdminContentBlock> {
    if (!isKnownKey(key)) throw new NotFoundException('Content not found')
    await this.prisma.contentBlock.upsert({
      where: { key },
      create: { key, data: Prisma.JsonNull, isActive: false },
      update: { data: Prisma.JsonNull, isActive: false },
    })
    return this.getForAdmin(key)
  }
}
