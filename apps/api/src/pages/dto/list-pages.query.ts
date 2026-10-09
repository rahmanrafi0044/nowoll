import { IsIn, IsOptional } from 'class-validator'

export class ListPagesQuery {
  /** No status → drafts and published (archived pages only when asked for). */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}
