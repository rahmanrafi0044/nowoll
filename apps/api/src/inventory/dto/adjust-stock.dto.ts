import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateIf,
} from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

// Send EXACTLY ONE of `change` or `setTo`:
//   { "change": 20,  "note": "Received shipment from supplier" }
//   { "change": -2,  "note": "Damaged in storage" }
//   { "setTo": 14,   "note": "Monthly stock count" }
export class AdjustStockDto {
  @ValidateIf((o: AdjustStockDto) => o.setTo === undefined)
  @IsInt({ message: 'send either change or setTo (a whole number)' })
  @NotEquals(0, { message: 'change cannot be 0' })
  @Min(-1_000_000)
  @Max(1_000_000)
  change?: number

  @ValidateIf((o: AdjustStockDto) => o.change === undefined)
  @IsInt({ message: 'send either change or setTo (a whole number)' })
  @Min(0)
  @Max(1_000_000)
  setTo?: number

  // Required (decision #3): the stock history should always say WHY.
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'note is required — say why the stock changed' })
  @MinLength(3)
  @MaxLength(300)
  note: string
}
