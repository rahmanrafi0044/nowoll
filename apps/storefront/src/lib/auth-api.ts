import type { AccountView } from '@nowoll/types'
import { call } from '@/lib/cart-api'

// Customer accounts (step 22). The API sets/clears the login cookies itself;
// the browser code never touches a token.
type WithUser = { user: AccountView }

export const fetchMe = () => call<WithUser>('GET', '/auth/me')

export const register = (body: {
  fullName: string
  email: string
  phone?: string
  password: string
}) => call<WithUser>('POST', '/auth/register', body)

export const login = (body: { email: string; password: string }) =>
  call<WithUser>('POST', '/auth/login', body)

export const logout = () => call<{ signedOut: true }>('POST', '/auth/logout', {})

export const forgotPassword = (email: string) =>
  call<{ sent: true }>('POST', '/auth/forgot-password', { email })

export const resetPassword = (body: { tokenHash: string; password: string }) =>
  call<WithUser>('POST', '/auth/reset-password', body)

/**
 * OPEN-REDIRECT GUARD for "?next=": only paths on THIS site ("/account"),
 * never "//evil.com" or "https://evil.com".
 */
export function safeNext(next: string | null | undefined, fallback = '/account'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : fallback
}
