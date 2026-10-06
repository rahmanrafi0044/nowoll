'use client'

import { Button } from '@nowoll/ui'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { LOGIN_PATH } from '@/lib/admin-access'
import { type AdminProfile, fetchAdmin, signOut } from '@/lib/admin-auth-api'

// ============================================================================
// Wraps every admin page except sign-in. Before showing anything it asks the
// API "who is this?" — the API is the only one that can verify the HttpOnly
// admin cookies (staff role + 2FA). No → back to sign-in. So nothing of the
// admin panel is shown to someone the API would refuse anyway.
//
// (Checked in the browser on purpose, like the shop's account pages: if the
// server renewed an expired session while rendering, the browser would never
// receive the new cookies — and the old refresh token would be used up.)
// ============================================================================
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchAdmin().then((r) => {
      if (!live) return
      if (r.ok) return setAdmin(r.data.admin)
      if (r.status === 401 || r.status === 403) {
        const params = new URLSearchParams({ next: pathname })
        if (r.status === 403) params.set('error', 'forbidden')
        window.location.replace(`${LOGIN_PATH}?${params}`)
      } else setProblem(r.message) // API down / offline: say so, don't pretend to sign out
    })
    return () => {
      live = false
    }
  }, [pathname])

  if (problem)
    return (
      <p
        role="alert"
        className="mx-auto mt-10 max-w-md rounded-control bg-danger-soft p-4 text-sm text-danger"
      >
        {problem}
      </p>
    )
  if (!admin)
    return <p className="mx-auto mt-10 max-w-6xl px-4 text-sm text-muted-foreground">Loading…</p>

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold">Nowoll Admin</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {admin.fullName ?? admin.email} · {admin.role === 'ADMIN' ? 'Admin' : 'Staff'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await signOut()
                window.location.replace(LOGIN_PATH)
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      {children}
    </>
  )
}
