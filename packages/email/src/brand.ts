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
