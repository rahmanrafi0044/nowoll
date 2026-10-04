import { PartialType } from '@nestjs/mapped-types'
import { UploadImageDto } from './upload-image.dto.js'

// PATCH /products/:id/images/:imageId — fix alt text, reorder, or re-link to a variant.
export class UpdateImageDto extends PartialType(UploadImageDto) {}
