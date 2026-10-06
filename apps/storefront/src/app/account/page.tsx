import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AccountOverview } from '@/components/account/account-overview'

// Spec: "Account Dashboard — Server + auth guard".
// The guard here is a quick, OPTIMISTIC check — "is there a login cookie at
// all?" — so visitors without one go straight to sign-in. The REAL check is
// the API's: AccountOverview asks it who you are, with the HttpOnly cookies.
// (The account data is loaded in the browser on purpose: if the server
// renewed an expired session here, the browser would never get the new
// cookies — and the old refresh token would already be used up.)
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your account', robots: { index: false, follow: false } }
}

export default async function AccountPage() {
  const jar = await cookies()
  if (!jar.has('nw_refresh') && !jar.has('nw_access')) redirect('/login?next=/account')
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <div className="mt-8">
        <AccountOverview />
      </div>
    </div>
  )
}
