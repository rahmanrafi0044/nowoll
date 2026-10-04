'use client' // error boundaries must be Client Components

import { useEffect } from 'react'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // TODO(phase 7): report to Sentry
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      {error.digest && <p className="mt-2 text-xs text-neutral-400">Error ID: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Try again
      </button>
    </main>
  )
}
