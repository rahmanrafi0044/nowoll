import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false }, // don't let Google index 404 pages
}

// Shown for unknown URLs, and whenever a page calls notFound()
// (e.g. a product slug that doesn't exist).
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-neutral-500">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-neutral-600">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Back to home
      </Link>
    </section>
  )
}
