'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { MyOrders } from './my-orders'

/** /account — your details and recent orders (the other sections are in the side menu). */
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
      <section aria-labelledby="recent-orders" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-orders" className="text-xl font-semibold">
            Recent orders
          </h2>
          <Link href="/account/orders" className="text-sm underline underline-offset-4">
            All orders
          </Link>
        </div>
        <MyOrders limit={3} />
      </section>
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
