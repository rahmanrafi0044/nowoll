import { OmitType, PartialType } from '@nestjs/mapped-types'
import { CreateVariantDto } from './create-variant.dto.js'

// Everything optional — and `stock` removed on purpose: stock changes must go
// through the inventory module so each one is recorded in inventory_logs.
export class UpdateVariantDto extends PartialType(OmitType(CreateVariantDto, ['stock'] as const)) {}
