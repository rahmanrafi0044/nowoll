import { PartialType } from '@nestjs/mapped-types'
import { CreateShippingZoneDto } from './save-shipping-zone.dto.js'

export class UpdateShippingZoneDto extends PartialType(CreateShippingZoneDto) {}
