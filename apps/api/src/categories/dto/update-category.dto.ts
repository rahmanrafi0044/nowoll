import { PartialType } from '@nestjs/mapped-types'
import { CreateCategoryDto } from './create-category.dto.js'

// PartialType = the same fields and rules as create, but every field optional.
// PATCH semantics: fields you don't send stay unchanged.
//   parentId: null → move to top level · description: "" → clear it
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
