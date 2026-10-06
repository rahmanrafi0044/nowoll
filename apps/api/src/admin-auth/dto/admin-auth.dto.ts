import { Matches } from 'class-validator'

/** The 6 digits shown in the authenticator app (spaces are removed by the browser form). */
export class TwoFactorCodeDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your authenticator app' })
  code!: string
}
