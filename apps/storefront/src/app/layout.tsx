import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import type { CategoryNode } from '@nowoll/types'
import type { AnnouncementBar as AnnouncementBarData } from '@nowoll/validation'
import { CartHydrator } from '@/components/cart-hydrator'
import { AnnouncementBar } from '@/components/home/announcement-bar'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { apiGet } from '@/lib/api'
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

// The header, announcement bar and footer appear on every page, so their data
// is loaded here. Both requests run in parallel and are cached for 60 seconds.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [categories, announcement] = await Promise.all([
    apiGet<CategoryNode[]>('/categories'),
    apiGet<{ data: AnnouncementBarData }>('/content-blocks/announcement_bar'),
  ])

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CartHydrator />
        {announcement && <AnnouncementBar data={announcement.data} />}
        <SiteHeader categories={categories ?? []} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
