'use client'

import type { AccountView } from '@nowoll/types'
import { create } from 'zustand'
import { fetchMe, logout } from '@/lib/auth-api'

// Who is signed in, as far as the PAGE knows. Not saved anywhere: the real
// session is in HttpOnly cookies, and this asks the API once per page load.
interface SessionState {
  status: 'unknown' | 'signed-in' | 'signed-out'
  user: AccountView | null
  /** Asks the API (once). */
  load: () => Promise<void>
  signedIn: (user: AccountView) => void
  signOut: () => Promise<void>
}

let loading: Promise<void> | null = null

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'unknown',
  user: null,
  load: () => {
    if (get().status !== 'unknown') return Promise.resolve()
    loading ??= fetchMe().then((r) => {
      set(r.ok ? { status: 'signed-in', user: r.data.user } : { status: 'signed-out', user: null })
      loading = null
    })
    return loading
  },
  signedIn: (user) => set({ status: 'signed-in', user }),
  signOut: async () => {
    await logout()
    set({ status: 'signed-out', user: null })
  },
}))
