import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CartHydrator } from '@/components/cart-hydrator'
import { publicEnv } from '@/lib/env'
import './globals.css'

// Site-wide SEO defaults. Each page's generateMetadata() fills in `title`,
// which the template turns into e.g. "Oxford Shirt | Nowoll".
export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl), // makes relative OG/canonical URLs absolute
  title: { default: 'Nowoll — always new', template: '%s | Nowoll' },
  description: 'Nowoll — always new. Clothing for Bangladesh, delivered nationwide.',
  applicationName: 'Nowoll',
  openGraph: { type: 'website', siteName: 'Nowoll', locale: 'en_BD' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CartHydrator />
        <header className="border-b border-neutral-200">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-xl font-semibold tracking-tight">
              Nowoll
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200">
          <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-neutral-500">
            © {new Date().getFullYear()} Nowoll — always new
          </div>
        </footer>
      </body>
    </html>
  )
}
