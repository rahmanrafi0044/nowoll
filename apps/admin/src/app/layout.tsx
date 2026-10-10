import type { Metadata } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { fontVariables } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Nowoll Admin', template: '%s | Nowoll Admin' },
  robots: { index: false, follow: false }, // never index the admin panel
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every admin page per request (never prebuilt at build time).
  // Required for the CSP nonce — a prebuilt page can't contain a nonce that
  // is generated fresh for each request. Admin pages show live data anyway.
  await connection()

  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
