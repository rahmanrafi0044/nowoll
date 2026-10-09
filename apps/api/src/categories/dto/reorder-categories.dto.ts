import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator'

/** PATCH /admin/categories/order — one group of sister categories, in the new order. */
export class ReorderCategoriesDto {
  /** null = the top-level categories. */
  @ValidateIf((o: ReorderCategoriesDto) => o.parentId !== null)
  @IsUUID('all', { message: 'parentId must be a category id or null' })
  parentId!: string | null

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}
