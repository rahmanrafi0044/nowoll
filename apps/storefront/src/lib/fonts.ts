import {
  Cormorant_Garamond,
  Hind_Siliguri,
  Inter,
  Playfair_Display,
  Poppins,
} from 'next/font/google'
import type { FontChoice, HeadingFont } from '@nowoll/validation'

// ============================================================================
// The fonts the shop can use (Admin → Settings → Look, step 38 part 2).
// next/font downloads them at BUILD time and serves them from the shop itself
// — visitors never load anything from Google. preload: false + only the
// chosen family used in the CSS → a browser downloads just that one font.
// ============================================================================

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
})
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-poppins',
})
const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-hind-siliguri',
})

// Heading fonts (design refresh 38f) — headings and product names.
// Cormorant Garamond: the default, elegant and light. Playfair Display: a classic,
// high-contrast fashion serif. Only the chosen one is ever downloaded.
// (Normal style only: the browser slants it for <em>. Turbopack could not build
// Bodoni Moda or the italic files — Oct 2026.)
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-cormorant',
})
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-playfair',
})

/** Put on <html>: defines the --font-* variables (no font is downloaded until used). */
export const fontVariables = [
  inter.variable,
  poppins.variable,
  hindSiliguri.variable,
  cormorant.variable,
  playfair.variable,
].join(' ')

// Bangla headings in a Latin-only serif fall back to the system's Bangla serif.
const SERIF_FALLBACK = "Georgia, 'Times New Roman', 'Noto Serif Bengali', serif"

/** The CSS font stack for headings (Admin → Settings → Heading font). */
export function headingStack(choice: HeadingFont): string {
  switch (choice) {
    case 'serif_elegant':
      return `var(--font-cormorant), ${SERIF_FALLBACK}`
    case 'serif_classic':
      return `var(--font-playfair), ${SERIF_FALLBACK}`
    case 'same_as_body':
      return 'var(--font-sans)'
  }
}

// Bangla text in a Latin-only font falls back to the system's Bangla font.
const FALLBACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif"

/** The CSS font stack for a choice; null = keep the theme's system fonts. */
export function fontStack(choice: FontChoice): string | null {
  switch (choice) {
    case 'inter':
      return `var(--font-inter), ${FALLBACK}`
    case 'poppins':
      return `var(--font-poppins), ${FALLBACK}`
    case 'hind_siliguri':
      return `var(--font-hind-siliguri), ${FALLBACK}`
    default:
      return null
  }
}
