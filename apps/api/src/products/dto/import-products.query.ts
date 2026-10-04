import { IsBoolean, IsOptional } from 'class-validator'
import { ToBoolean } from '../../common/validation/transforms.js'

export class ImportProductsQuery {
  /** true = check the file and report what WOULD change, without saving anything. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  dryRun?: boolean
}
