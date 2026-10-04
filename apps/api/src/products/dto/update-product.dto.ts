import { OmitType, PartialType } from '@nestjs/mapped-types'
import { ProductStatus } from '@nowoll/database/enums'
import { IsIn, IsOptional } from 'class-validator'
import { CreateProductDto } from './create-product.dto.js'

// Variants are managed through /variants, not here.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {
  // DRAFT ↔ ACTIVE. ARCHIVED is only reached through DELETE.
  @IsOptional()
  @IsIn([ProductStatus.DRAFT, ProductStatus.ACTIVE], { message: 'status must be DRAFT or ACTIVE' })
  status?: typeof ProductStatus.DRAFT | typeof ProductStatus.ACTIVE
}
