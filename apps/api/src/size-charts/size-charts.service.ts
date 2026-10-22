import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, SizeChart } from '@nowoll/database'
import { sizeChartInputSchema, sizeChartProblems, sizeChartSchema } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SaveSizeChartDto } from './dto/save-size-chart.dto.js'

/** What the product page shows. */
export interface PublicSizeChart {
  unit: 'INCH' | 'CM'
  note: string | null
  pieces: { name: string; columns: string[]; rows: { size: string; values: string[] }[] }[]
}

export interface AdminSizeChartView extends PublicSizeChart {
  id: string
  name: string
  isActive: boolean
  productCount: number
  categoryCount: number
  updatedAt: Date
}

/**
 * A saved chart, re-checked on the way out (like the content blocks): one that
 * no longer fits the rules — or is switched off — is simply not shown.
 */
export function readSizeChart(
  chart: Pick<SizeChart, 'unit' | 'note' | 'pieces' | 'isActive'> | null | undefined,
): PublicSizeChart | null {
  if (!chart?.isActive) return null
  const parsed = sizeChartSchema.safeParse(chart)
  return parsed.success ? parsed.data : null
}

// ============================================================================
// Size charts (38f) — Admin → Size charts. Made once, then used by products or
// whole categories. No delete: a chart in use is archived (isActive = false),
// the shop stops showing it, and it can be switched back on (CLAUDE.md §7).
// ============================================================================
@Injectable()
export class SizeChartsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminSizeChartView[]> {
    const rows = await this.prisma.sizeChart.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
            categories: { where: { deletedAt: null } },
          },
        },
      },
    })
    return rows.map((r) => this.toAdmin(r, r._count.products, r._count.categories))
  }

  async get(id: string): Promise<AdminSizeChartView> {
    const r = await this.prisma.sizeChart.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
            categories: { where: { deletedAt: null } },
          },
        },
      },
    })
    if (!r) throw new NotFoundException('Size chart not found')
    return this.toAdmin(r, r._count.products, r._count.categories)
  }

  async create(dto: SaveSizeChartDto): Promise<AdminSizeChartView> {
    const created = await this.prisma.sizeChart.create({ data: this.check(dto) })
    return this.toAdmin(created, 0, 0)
  }

  async update(id: string, dto: SaveSizeChartDto): Promise<AdminSizeChartView> {
    await this.get(id)
    await this.prisma.sizeChart.update({ where: { id }, data: this.check(dto) })
    return this.get(id)
  }

  /** Products and categories call this before linking to a chart. */
  async assertExists(id: string | null | undefined): Promise<void> {
    if (!id) return
    const found = await this.prisma.sizeChart.count({ where: { id } })
    if (!found)
      throw new BadRequestException({
        message: 'That size chart no longer exists — pick another.',
        code: 'SIZE_CHART_NOT_FOUND',
      })
  }

  private check(dto: SaveSizeChartDto): Prisma.SizeChartCreateInput {
    const parsed = sizeChartInputSchema.safeParse(dto)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Some of the chart needs fixing — see the list.',
        code: 'INVALID_SIZE_CHART',
        details: sizeChartProblems(parsed.error),
      })
    const { pieces, ...rest } = parsed.data
    return { ...rest, pieces: pieces as Prisma.InputJsonValue }
  }

  private toAdmin(r: SizeChart, productCount: number, categoryCount: number): AdminSizeChartView {
    // An old chart that no longer fits the rules still opens in the editor (to fix it).
    const parsed = sizeChartSchema.safeParse(r)
    return {
      id: r.id,
      name: r.name,
      unit: r.unit,
      note: r.note,
      pieces: parsed.success ? parsed.data.pieces : [],
      isActive: r.isActive,
      productCount,
      categoryCount,
      updatedAt: r.updatedAt,
    }
  }
}
