'use client'

import { useEffect } from 'react'

// Last-resort error page, used only if the ROOT LAYOUT itself crashes.
// It replaces the whole document, so it must render its own <html>/<body>
// and can't rely on globals.css — hence the inline styles.
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
      <body
        style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '6rem 1rem' }}
      >
        <title>Something went wrong | Nowoll</title>
        <h1>Something went wrong</h1>
        <p>Sorry — Nowoll didn’t load properly. Please try again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  )
}
