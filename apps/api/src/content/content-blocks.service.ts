import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CONTENT_BLOCK_SCHEMAS, type ContentBlockKey } from '@nowoll/validation'
import { PrismaService } from '../prisma/prisma.service.js'

const isKnownKey = (key: string): key is ContentBlockKey => key in CONTENT_BLOCK_SCHEMAS

@Injectable()
export class ContentBlocksService {
  private readonly logger = new Logger(ContentBlocksService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /content-blocks/:key — an ACTIVE block from the allow-list, checked
   * against its schema. Unknown keys, inactive blocks and blocks whose data
   * doesn't match the schema all answer 404, so the storefront simply hides
   * that section instead of showing broken content.
   */
  async findActive(key: string): Promise<{ key: string; data: unknown }> {
    if (!isKnownKey(key)) throw new NotFoundException('Content not found')

    const block = await this.prisma.contentBlock.findUnique({ where: { key } })
    if (!block || !block.isActive) throw new NotFoundException('Content not found')

    const parsed = CONTENT_BLOCK_SCHEMAS[key].safeParse(block.data)
    if (!parsed.success) {
      this.logger.warn(
        `Content block "${key}" has invalid data — hidden. Fix it in Admin → Content.`,
      )
      throw new NotFoundException('Content not found')
    }
    return { key, data: parsed.data }
  }
}
