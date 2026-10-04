import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads the real theme.css, so changing a brand color later can't silently
// make text unreadable — this test fails instead.
const css = readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8')
const token = (name: string): string => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`token --color-${name} not found`)
  return match[1]
}

// WCAG 2.1 contrast ratio: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// [text, background] pairs the components actually use
const pairs: [string, string][] = [
  ['foreground', 'surface'],
  ['foreground', 'surface-muted'],
  ['muted-foreground', 'surface'],
  ['brand-foreground', 'brand'],
  ['brand-foreground', 'brand-hover'],
  ['danger', 'surface'], // input error text
  ['danger', 'danger-soft'],
  ['success', 'success-soft'],
  ['warning', 'warning-soft'],
  ['info', 'info-soft'],
]

describe('theme tokens meet WCAG 2.1 AA contrast (4.5:1)', () => {
  it.each(pairs)('%s on %s', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5)
  })

  it('white text on the danger button is readable', () => {
    expect(contrast('#ffffff', token('danger'))).toBeGreaterThanOrEqual(4.5)
  })
})
