import { Hind_Siliguri, Inter, Poppins } from 'next/font/google'
import type { FontChoice } from '@nowoll/validation'

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

/** Put on <html>: defines the --font-* variables (no font is downloaded until used). */
export const fontVariables = [inter.variable, poppins.variable, hindSiliguri.variable].join(' ')

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
