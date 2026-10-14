import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Put,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { EMAIL_KIND_KEYS, type EmailKind, emailWordingSchema } from '@nowoll/validation'
import { IsBoolean, IsDefined, IsIn } from 'class-validator'
import type { AdminProfile } from '../admin-auth/admin-auth.service.js'
import { AdminOnly } from '../common/decorators/admin-only.decorator.js'
import { CurrentAdmin } from '../common/guards/admin.guard.js'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { ContentBlocksService } from './content-blocks.service.js'

class SaveWordingDto {
  /** Checked against emailWordingSchema in the service (placeholders, lengths). */
  @IsDefined()
  data!: unknown

  @IsBoolean()
  isActive!: boolean
}

class TestEmailDto {
  @IsIn(EMAIL_KIND_KEYS)
  kind!: EmailKind

  /** The wording on the admin's screen (may be unsaved) — checked like a save. */
  @IsDefined()
  wording!: unknown
}

// /api/v1/admin/email-wording — Admin → Content → Emails (step 43b). ADMIN
// only: every customer's emails speak in these words. Stored as the PRIVATE
// content block "email_wording" (the shop's public route never returns it).
@Controller('admin/email-wording')
@AdminOnly({ role: 'ADMIN' })
export class EmailWordingController {
  constructor(
    private readonly blocks: ContentBlocksService,
    @Inject(CUSTOMER_NOTIFIER) private readonly notifier: CustomerNotifier,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return this.blocks.getForAdmin('email_wording')
  }

  @Put()
  save(@Body() dto: SaveWordingDto) {
    return this.blocks.save('email_wording', dto.data, dto.isActive)
  }

  /** Back to the built-in wording everywhere. */
  @Delete()
  clear() {
    return this.blocks.clear('email_wording')
  }

  /**
   * "Send me a test": the example email with this wording, to the SIGNED-IN
   * admin's own address — never an address from the request (so this can't
   * be used to send email to anyone else). 5 a minute.
   */
  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async test(@Body() dto: TestEmailDto, @CurrentAdmin() admin?: AdminProfile) {
    const parsed = emailWordingSchema.safeParse(dto.wording)
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Some of this wording isn’t allowed — see the list.',
        code: 'INVALID_CONTENT',
        details: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join(' › ')}: ${i.message}` : i.message,
        ),
      })
    if (!admin?.email) throw new BadRequestException('Your admin account has no email address.')
    await this.notifier.emailTest(dto.kind, admin.email, parsed.data)
    return { sentTo: admin.email }
  }
}
