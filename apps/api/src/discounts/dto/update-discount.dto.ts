import { PartialType } from '@nestjs/mapped-types'
import { CreateDiscountDto } from './create-discount.dto.js'

// Everything optional. `code` and `type` are refused once the code has been
// used (decision #6) — that check lives in DiscountsService.update().
export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}
