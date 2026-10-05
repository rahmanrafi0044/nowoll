import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

/** POST /orders/track — what the customer types on the "Track your order" page. */
export class TrackOrderDto {
  /** "NW-10001", "nw10001" or "10001" — parsed in OrderLookupService. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Enter your order number' })
  @MaxLength(20)
  orderNumber!: string

  /** The email OR mobile number used at checkout. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Enter the email or mobile number you used at checkout' })
  @MaxLength(254)
  contact!: string
}
