import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@nowoll/validation'
import { Transform } from 'class-transformer'
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { NormalizePhone } from '../../common/validation/phone.js'
import { Trim } from '../../common/validation/transforms.js'

// Emails are compared lower-case everywhere (same as checkout).
const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )

// Passwords are NOT trimmed: a space can be part of a password.
const Password = () => (target: object, key: string) => {
  IsString()(target, key)
  MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })(target, key)
  MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })(target, key)
}

export class RegisterDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  @MaxLength(100)
  fullName!: string

  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string

  /** Optional — saves typing it at checkout. */
  @NormalizePhone()
  @IsOptional()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number' })
  phone?: string

  @Password()
  password!: string
}

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string

  // Only "not empty" here: old passwords may predate the length rule.
  @IsString()
  @IsNotEmpty({ message: 'Enter your password' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string
}

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string
}

export class ResetPasswordDto {
  /** token_hash from the reset link in the email. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  tokenHash!: string

  @Password()
  password!: string
}

/** PATCH /auth/me — the customer's own details. (Email changes wait for step 26: Supabase must confirm them by email.) */
export class UpdateProfileDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'fullName cannot be empty' })
  @MaxLength(100)
  fullName?: string

  /** null or "" clears it. */
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @NormalizePhone()
  @IsOptional()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number' })
  phone?: string | null
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string

  @Password()
  newPassword!: string
}
