import { createContext, useContext } from 'react'

// Nowoll's look in emails — the same colours as the shop's theme
// (packages/ui/src/theme.css). Email apps ignore CSS variables and most
// stylesheets, so the values are written out and applied inline.
export const BRAND = {
  name: 'Nowoll',
  tagline: 'always new',
  colors: {
    brand: '#111111',
    brandForeground: '#ffffff',
    foreground: '#111111',
    muted: '#5f5f5f',
    border: '#e5e5e5',
    surfaceMuted: '#f5f5f5',
    success: '#15803d',
  },
  font: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const

/** One email's own wording (Admin → Content → Emails, step 43b). Empty = the built-in text. */
export interface EmailText {
  subject: string
  heading: string
  intro: string
}

/** The store's name and tagline — from Admin → Settings (step 38), BRAND as the fallback. */
export interface StoreBrand {
  name: string
  tagline: string
  /** Button colour (Admin → Settings → Look). A checked #rrggbb readable with white text. */
  color?: string
  /** Step 43b: the logo at the top (only PNG/JPEG — see emailLogo), else the name. */
  logoUrl?: string
  /** Step 43b: the footer line (empty = the built-in line). */
  footer?: string
  /** Step 43b: per email (by its tag, e.g. "order-shipped"), already checked by the API. */
  wording?: Partial<Record<string, Partial<EmailText>>>
}

/** Many email apps (Outlook) can't show WebP or SVG — only PNG/JPEG logos are used. */
export const emailLogo = (url: string | undefined) => {
  if (!url) return null
  try {
    return /\.(png|jpe?g)$/i.test(new URL(url).pathname) && url.startsWith('https://') ? url : null
  } catch {
    return null
  }
}

/** Fill {name}, {order}… — a placeholder without a value is dropped, never shown raw. */
export const fill = (text: string, values: Partial<Record<string, string>>) =>
  text.replace(/\{([^{}\s]*)\}/g, (_, key: string) => values[key] ?? '')

export const DEFAULT_STORE: StoreBrand = { name: BRAND.name, tagline: BRAND.tagline }

/** Only a plain #rrggbb ever reaches an email's styles; anything else → the default. */
export const safeColor = (color: string | undefined) =>
  color && /^#[0-9a-f]{6}$/i.test(color) ? color : BRAND.colors.brand

/**
 * CONTEXT (React): renderEmail() puts the current store name here once, and
 * the layout and templates read it — so no template needs it passed in.
 */
export const StoreContext = createContext<StoreBrand>(DEFAULT_STORE)

/** The store's name inside an email's text. */
export function StoreName() {
  return useContext(StoreContext).name
}
