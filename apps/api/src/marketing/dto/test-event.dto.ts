import { IsString, Matches } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

/** The code Events Manager → Test events shows, e.g. TEST12345 (docs/integrations/meta.md). */
export class TestEventDto {
  @Trim()
  @IsString()
  @Matches(/^TEST[A-Za-z0-9]{1,30}$/, {
    message: 'Copy the test code from Meta Events Manager → Test events (it starts with TEST)',
  })
  testEventCode: string
}
