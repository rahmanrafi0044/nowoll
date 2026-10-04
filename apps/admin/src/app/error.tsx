'use client' // error boundaries must be Client Components

import { Button } from '@nowoll/ui'
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
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
      <Button onClick={() => retry()} className="mt-6">
        Try again
      </Button>
    </main>
  )
}
