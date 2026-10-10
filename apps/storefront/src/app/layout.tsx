import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import type { CategoryNode, PageLinkView } from '@nowoll/types'
import type { AnnouncementBar as AnnouncementBarData } from '@nowoll/validation'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { CartHydrator } from '@/components/cart-hydrator'
import { AnnouncementBar } from '@/components/home/announcement-bar'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { apiGet } from '@/lib/api'
import { publicEnv } from '@/lib/env'
import { getSettings, siteTitle } from '@/lib/settings'
import './globals.css'

// Site-wide SEO defaults, from Admin → Settings (step 38). Each page's
// generateMetadata() fills in `title`, which the template turns into e.g.
// "Oxford Shirt | Nowoll".
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings()
  return {
    metadataBase: new URL(publicEnv.siteUrl), // makes relative OG/canonical URLs absolute
    title: { default: s.seo_title || siteTitle(s), template: `%s | ${s.store_name}` },
    description:
      s.seo_description || `${siteTitle(s)}. Clothing for Bangladesh, delivered nationwide.`,
    applicationName: s.store_name,
    openGraph: { type: 'website', siteName: s.store_name, locale: 'en_BD' },
    robots: { index: true, follow: true },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

// The header, announcement bar and footer appear on every page, so their data
// is loaded here. The requests run in parallel and are cached for 60 seconds.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [categories, announcement, pages, settings] = await Promise.all([
    apiGet<CategoryNode[]>('/categories'),
    apiGet<{ data: AnnouncementBarData }>('/content-blocks/announcement_bar'),
    apiGet<PageLinkView[]>('/pages'),
    getSettings(),
  ])

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CartHydrator />
        {announcement && <AnnouncementBar data={announcement.data} />}
        <SiteHeader categories={categories ?? []} storeName={settings.store_name} />
        <main className="flex-1">{children}</main>
        <SiteFooter pages={pages ?? []} settings={settings} />
        <CartDrawer />
      </body>
    </html>
  )
}
