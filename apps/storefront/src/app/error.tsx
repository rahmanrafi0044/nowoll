'use client' // error boundaries must be Client Components

import { useEffect } from 'react'

// Shown when a page crashes while rendering (the "500" page from the spec).
// The header and footer from layout.tsx stay visible around it.
//
// In production Next.js replaces server error messages with a generic one plus
// a `digest` id, so customers never see internal details. The digest lets us
// find the full error in the server logs (and in Sentry, from Phase 7).
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
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-neutral-600">
        Sorry — this page didn’t load properly. Please try again.
      </p>
      {error.digest && <p className="mt-2 text-xs text-neutral-400">Error ID: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Try again
      </button>
    </section>
  )
}
