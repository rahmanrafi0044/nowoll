import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma, Redirect } from '@nowoll/database'
import {
  cleanPath,
  isProtectedPath,
  type RedirectRule,
  redirectInputSchema,
} from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SaveRedirectDto } from './dto/redirect.dto.js'

// ============================================================================
// Redirects (step 43c). Old web address → new one, so old links keep working.
// Two rules keep them healthy:
//   • NO LOOPS — A → B when B already leads back to A is refused
//   • NO CHAINS — visitors make ONE hop: if A → B is added and B → C exists,
//     A is saved as → C; and anything already pointing at A now points at B
// Products, categories and pages call `moved()` when their address changes.
// ============================================================================

type Db = PrismaService | Prisma.TransactionClient

/** The path part of a target ("/shop?sort=new" → "/shop") — chains follow paths. */
const pathOf = (to: string) => cleanPath(to) ?? to

@Injectable()
export class RedirectsService {
  private readonly logger = new Logger(RedirectsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** GET /redirects — the active rules, for the shop's proxy. */
  async rules(): Promise<RedirectRule[]> {
    const rows = await this.prisma.redirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true, permanent: true },
    })
    return rows.map((r) => ({ from: r.fromPath, to: r.toPath, permanent: r.permanent }))
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  list(q?: string): Promise<Redirect[]> {
    const term = q?.trim().toLowerCase()
    return this.prisma.redirect.findMany({
      where: term
        ? { OR: [{ fromPath: { contains: term } }, { toPath: { contains: term } }] }
        : undefined,
      orderBy: [{ updatedAt: 'desc' }],
    })
  }

  async create(dto: SaveRedirectDto): Promise<Redirect> {
    const input = this.check(dto)
    const taken = await this.prisma.redirect.findUnique({ where: { fromPath: input.fromPath } })
    if (taken)
      throw new ConflictException({
        message: `${input.fromPath} already redirects to ${taken.toPath} — edit that one instead.`,
        code: 'REDIRECT_EXISTS',
      })
    return this.prisma.$transaction((tx) => this.save(tx, null, input, 'MANUAL'))
  }

  async update(id: string, dto: SaveRedirectDto): Promise<Redirect> {
    const current = await this.prisma.redirect.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Redirect not found')
    const input = this.check(dto)
    if (input.fromPath !== current.fromPath) {
      const taken = await this.prisma.redirect.findUnique({ where: { fromPath: input.fromPath } })
      if (taken)
        throw new ConflictException({
          message: `${input.fromPath} already redirects elsewhere — edit that one instead.`,
          code: 'REDIRECT_EXISTS',
        })
    }
    return this.prisma.$transaction((tx) => this.save(tx, id, input, current.source))
  }

  /** Remove a rule (a setting, not a record — nothing else refers to it). */
  async remove(id: string): Promise<{ deleted: true }> {
    const current = await this.prisma.redirect.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Redirect not found')
    await this.prisma.redirect.delete({ where: { id } })
    return { deleted: true }
  }

  /**
   * A product / category / page changed its web address: the old one now
   * leads to the new one (AUTOMATIC). Never fails the change itself — a
   * problem is only logged. Also removes any redirect FROM the new address,
   * which would otherwise hide the page that now lives there.
   */
  async moved(oldPath: string, newPath: string, db: Db = this.prisma): Promise<void> {
    const from = cleanPath(oldPath)
    const to = cleanPath(newPath)
    if (!from || !to || from === to || isProtectedPath(from)) return
    try {
      await db.redirect.deleteMany({ where: { fromPath: to } })
      const existing = await db.redirect.findUnique({ where: { fromPath: from } })
      await this.save(
        db,
        existing?.id ?? null,
        { fromPath: from, toPath: to, permanent: true, isActive: true },
        'AUTO',
      )
    } catch (e) {
      this.logger.warn(`Could not add a redirect ${from} → ${to}: ${String(e)}`)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private check(dto: SaveRedirectDto) {
    const parsed = redirectInputSchema.safeParse(dto)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'This redirect isn’t allowed — see the list.',
        details: parsed.error.issues.map((i) => i.message),
      })
    return parsed.data
  }

  /** Saves A → B with the no-loop / no-chain rules. */
  private async save(
    db: Db,
    id: string | null,
    input: { fromPath: string; toPath: string; permanent: boolean; isActive: boolean },
    source: 'MANUAL' | 'AUTO',
  ): Promise<Redirect> {
    let target = input.toPath
    // NO CHAINS (forward): B already leads on to C → go straight to C.
    const seen = new Set([input.fromPath])
    for (let hops = 0; hops < 10; hops++) {
      const next = await db.redirect.findUnique({ where: { fromPath: pathOf(target) } })
      if (!next || !next.isActive) break
      if (seen.has(next.fromPath) || pathOf(next.toPath) === input.fromPath)
        throw new BadRequestException({
          message: `That would go round in a circle (${input.fromPath} → ${input.toPath} → … → ${input.fromPath}).`,
          code: 'REDIRECT_LOOP',
        })
      seen.add(next.fromPath)
      target = next.toPath
    }
    if (pathOf(target) === input.fromPath)
      throw new BadRequestException({
        message: 'An address can’t send visitors to itself.',
        code: 'REDIRECT_LOOP',
      })

    const data = {
      fromPath: input.fromPath,
      toPath: target,
      permanent: input.permanent,
      isActive: input.isActive,
    }
    const saved = id
      ? await db.redirect.update({ where: { id }, data: { ...data, source } })
      : await db.redirect.create({ data: { ...data, source } })

    // NO CHAINS (backward): X → A becomes X → (A's target), one hop for everyone.
    await db.redirect.updateMany({
      where: { toPath: input.fromPath, id: { not: saved.id } },
      data: { toPath: target },
    })
    return saved
  }
}
