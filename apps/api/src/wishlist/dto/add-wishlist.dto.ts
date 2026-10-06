import { IsUUID } from 'class-validator'

export class AddWishlistItemDto {
  /** The exact size + color to save (the wishlist is per variant — schema). */
  @IsUUID()
  variantId!: string
}
