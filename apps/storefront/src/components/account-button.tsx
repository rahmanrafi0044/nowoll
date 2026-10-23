'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { UserIcon } from './icons'

/** Header: the account icon — "Sign in", or the customer's account once signed in. */
export function AccountButton() {
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const load = useSessionStore((s) => s.load)
  useEffect(() => void load(), [load])

  const signedIn = status === 'signed-in' && !!user
  return (
    <Link
      href={signedIn ? '/account' : '/login'}
      aria-label={signedIn ? 'Your account' : 'Sign in'}
      className="inline-flex size-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
    >
      <UserIcon />
    </Link>
  )
}
