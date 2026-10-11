import { IsEmail, IsIn } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

const ROLES = ['ADMIN', 'STAFF'] as const

export class GrantStaffDto {
  @Trim()
  @IsEmail({}, { message: 'Enter the email of their shop account' })
  email!: string

  @IsIn(ROLES, { message: 'Choose Admin or Staff' })
  role!: (typeof ROLES)[number]
}

export class ChangeRoleDto {
  @IsIn(ROLES, { message: 'Choose Admin or Staff' })
  role!: (typeof ROLES)[number]
}
