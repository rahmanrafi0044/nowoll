import { Hind_Siliguri, Inter, Poppins } from 'next/font/google'

// The same fonts as the shop (apps/storefront/src/lib/fonts.ts) — loaded here
// only so Admin → Settings → Look can preview them. Self-hosted by Next.js
// (font-src 'self'); nothing downloads until the preview uses one.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
})
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-poppins',
})
const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-hind-siliguri',
})

export const fontVariables = [inter.variable, poppins.variable, hindSiliguri.variable].join(' ')

/** The preview's font-family for a choice. */
export const PREVIEW_FONT: Record<string, string> = {
  system:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif",
  inter: "var(--font-inter), ui-sans-serif, system-ui, 'Noto Sans Bengali', sans-serif",
  poppins: "var(--font-poppins), ui-sans-serif, system-ui, 'Noto Sans Bengali', sans-serif",
  hind_siliguri: 'var(--font-hind-siliguri), ui-sans-serif, system-ui, sans-serif',
}
