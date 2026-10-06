'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApiCallResult } from '@/lib/cart-api'

/**
 * Loads one piece of the signed-in customer's data. A dead session (401)
 * sends them to sign in and back; other failures show a message.
 */
export function useAccountData<T>(load: () => Promise<ApiCallResult<T>>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let cancelled = false
    void load().then((r) => {
      if (cancelled) return
      if (r.ok) return setData(r.data)
      if (r.status === 401)
        return window.location.replace(
          `/login?next=${encodeURIComponent(window.location.pathname)}`,
        )
      setError({
        status: r.status,
        message: r.message || 'Something went wrong. Please try again.',
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` decides when to reload
  }, [round, ...deps])

  /** Load again (after a change). */
  const reload = useCallback(() => setRound((r) => r + 1), [])
  return { data, error, reload, setData }
}
