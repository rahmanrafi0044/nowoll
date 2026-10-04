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
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted-foreground">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-control bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
      >
        Back to home
      </Link>
    </section>
  )
}
