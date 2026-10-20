import { brandHover, type PublicSettings, SETTINGS_SCHEMA } from '@nowoll/validation'
import { fontStack, headingStack } from './fonts'

/**
 * The shop's look from Admin → Settings (step 38, part 2) as CSS variables —
 * overriding the theme's defaults (packages/ui/src/theme.css). Every value is
 * re-checked here (a #rrggbb colour, a font from the list), so nothing but a
 * colour or a known font name can ever reach the page's styles.
 * NOTE for the Phase 6 Content-Security-Policy: this is an inline <style>
 * block — the policy must allow it (a hash or nonce), see next.config.ts.
 */
export function themeCss(
  s: Pick<PublicSettings, 'brand_color' | 'font'> & Partial<Pick<PublicSettings, 'heading_font'>>,
): string {
  const vars: string[] = []
  const color = SETTINGS_SCHEMA.shape.brand_color.safeParse(s.brand_color)
  if (color.success && color.data !== '#111111')
    vars.push(`--color-brand:${color.data}`, `--color-brand-hover:${brandHover(color.data)}`)
  const font = SETTINGS_SCHEMA.shape.font.safeParse(s.font)
  const stack = font.success ? fontStack(font.data) : null
  if (stack) vars.push(`--font-sans:${stack}`)
  // 38f: headings + product names. The elegant serif is the theme's default
  // (packages/ui/src/theme.css) — only another choice is written here.
  const heading = SETTINGS_SCHEMA.shape.heading_font.safeParse(s.heading_font)
  if (heading.success && heading.data !== 'serif_elegant')
    vars.push(`--font-display:${headingStack(heading.data)}`)
  return vars.length ? `:root{${vars.join(';')}}` : ''
}
