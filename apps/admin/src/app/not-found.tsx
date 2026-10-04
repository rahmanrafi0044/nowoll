import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-neutral-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <Link href="/admin/dashboard" className="mt-6 text-sm font-medium underline">
        Back to dashboard
      </Link>
    </main>
  )
}
