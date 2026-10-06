'use client'

import { useCallback, useEffect, useState } from 'react'
import { LOGIN_PATH } from '@/lib/admin-access'
import type { ApiCallResult } from '@/lib/api'

export type LoadState<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string }

/**
 * Loads one dashboard box's data. Each box loads on its own, so one failing
 * call shows "Couldn't load — Try again" in THAT box and the rest still work.
 * `load` must be stable (a module-level function, or wrapped in useCallback).
 */
export function useLoad<T>(load: () => Promise<ApiCallResult<T>>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void load().then((r) => {
      if (!live) return
      if (r.ok) return setState({ status: 'ok', data: r.data })
      // The session ran out (or access was removed) while the page was open → sign in again.
      if (r.status === 401 || r.status === 403) {
        const params = new URLSearchParams({ next: window.location.pathname })
        if (r.status === 403) params.set('error', 'forbidden')
        return window.location.replace(`${LOGIN_PATH}?${params}`)
      }
      setState({ status: 'error', message: r.message })
    })
    return () => {
      live = false
    }
  }, [load, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])

  return { state, retry }
}
