import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AccountNav } from '@/components/account/account-nav'

// Spec: every /account page is "Server + auth guard". This guard is a quick,
// OPTIMISTIC check — "is there a login cookie at all?" — so visitors without
// one go straight to sign-in. The REAL check is the API's: each page asks it
// for data with the HttpOnly cookies. (Data is loaded in the browser on
// purpose: if the server renewed an expired session here, the browser would
// never get the new cookies — and the old refresh token would be used up.)
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const jar = await cookies()
  if (!jar.has('nw_refresh') && !jar.has('nw_access')) redirect('/login?next=/account')
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:grid md:grid-cols-[13rem_1fr] md:gap-10">
      <AccountNav />
      <div className="mt-6 min-w-0 md:mt-0">{children}</div>
    </div>
  )
}
