'use client'

import { useEffect } from 'react'

// Used only if the root layout itself crashes; must render its own <html>/<body>.
export default function GlobalError({
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
    <html lang="en">
      <body>
        <title>Something went wrong | Nowoll Admin</title>
        <h1>Something went wrong</h1>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  )
}
