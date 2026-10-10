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

/** The store's name and tagline — from Admin → Settings (step 38), BRAND as the fallback. */
export interface StoreBrand {
  name: string
  tagline: string
}

export const DEFAULT_STORE: StoreBrand = { name: BRAND.name, tagline: BRAND.tagline }

/**
 * CONTEXT (React): renderEmail() puts the current store name here once, and
 * the layout and templates read it — so no template needs it passed in.
 */
export const StoreContext = createContext<StoreBrand>(DEFAULT_STORE)

/** The store's name inside an email's text. */
export function StoreName() {
  return useContext(StoreContext).name
}
