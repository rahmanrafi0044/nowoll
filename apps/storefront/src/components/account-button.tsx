'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useSessionStore } from '@/stores/session-store'

/** Header: "Sign in", or the customer's first name once signed in. */
export function AccountButton() {
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const load = useSessionStore((s) => s.load)
  useEffect(() => void load(), [load])

  // Until the API answers, keep the space (no "Sign in" flash for signed-in customers).
  if (status === 'unknown') return <span className="inline-block w-14" aria-hidden="true" />
  const signedIn = status === 'signed-in' && user
  const firstName = user?.fullName?.split(' ')[0]
  return (
    <Link
      href={signedIn ? '/account' : '/login'}
      className="text-sm font-medium hover:underline underline-offset-4"
      aria-label={signedIn ? 'Your account' : 'Sign in'}
    >
      {signedIn ? (firstName ?? 'Account') : 'Sign in'}
    </Link>
  )
}
