import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator'
import { CartItemDto } from '../../discounts/dto/validate-discount.dto.js'

// POST /cart/price — only WHAT is in the bag; prices come from the database.
// (An empty bag is allowed: it simply prices to ৳0.)
export class PriceCartDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[]
}
