import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

// The text fields sent alongside the file (multipart/form-data).
// Everything in multipart arrives as text, hence @Type(() => Number).
export class UploadImageDto {
  // Required: describes the photo for screen readers and Google Images.
  @Trim()
  @IsString()
  @IsNotEmpty({
    message: 'altText is required — describe the photo, e.g. "Blue oxford shirt, front view"',
  })
  @MaxLength(200)
  altText: string

  // Optional: link the photo to one color/size so the gallery can switch with it.
  @TrimOrNull()
  @IsOptional()
  @IsUUID('all')
  variantId?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number
}
