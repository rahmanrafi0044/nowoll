import { call } from '@/lib/api'

// Admin sign-in (step 29a) — see apps/api/src/admin-auth/admin-auth.controller.ts.
// The API sets and clears the admin cookies itself; this code never touches a token.

export interface AdminProfile {
  id: string
  email: string
  fullName: string | null
  role: 'ADMIN' | 'STAFF'
}

/** Step 1: email + password. `next` = what step 2 is. */
export const signIn = (body: { email: string; password: string }) =>
  call<{ next: 'enroll' | 'verify' }>('POST', '/admin/auth/login', body)

/** First sign-in only: the QR code to scan (and its secret, to type in instead). */
export const startEnrolment = () =>
  call<{ qrCode: string; secret: string }>('POST', '/admin/auth/2fa/enroll')

/** Step 2: the 6-digit code from the authenticator app. */
export const verifyCode = (code: string) =>
  call<{ admin: AdminProfile }>('POST', '/admin/auth/2fa/verify', { code })

/** Who is signed in — only answers once BOTH steps are done. */
export const fetchAdmin = () => call<{ admin: AdminProfile }>('GET', '/admin/auth/me')

export const signOut = () => call<{ signedOut: true }>('POST', '/admin/auth/logout')
