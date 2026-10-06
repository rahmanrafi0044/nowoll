'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/session-store'

/** /account — the basics for now; orders, addresses and wishlist arrive in step 23. */
export function AccountOverview() {
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const load = useSessionStore((s) => s.load)
  const signOut = useSessionStore((s) => s.signOut)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => void load(), [load])
  // The cookie looked present but the session is dead (expired, signed out elsewhere).
  useEffect(() => {
    if (status === 'signed-out' && !leaving) window.location.replace('/login?next=/account')
  }, [status, leaving])

  if (!user) return <p className="text-muted-foreground">Loading your account…</p>

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">Name</dt>
          <dd className="text-muted-foreground">{user.fullName ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold">Email</dt>
          <dd className="text-muted-foreground">{user.email}</dd>
        </div>
        <div>
          <dt className="font-semibold">Mobile</dt>
          <dd className="text-muted-foreground">{user.phone ?? '—'}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Orders you place while signed in are saved to your account. Order history, saved addresses
        and your wishlist are coming soon — meanwhile you can{' '}
        <Link
          href="/orders/track"
          className="font-medium text-foreground underline underline-offset-4"
        >
          track an order
        </Link>
        .
      </p>
      <Button
        variant="secondary"
        disabled={leaving}
        onClick={async () => {
          setLeaving(true)
          await signOut()
          window.location.replace('/')
        }}
      >
        {leaving ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}
