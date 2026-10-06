/**
 * A price typed into a form → a number for the API. Taka, at most 2 decimals
 * (poisha). Commas are allowed ("1,490"). Blank = null (only for optional prices).
 */
export function parsePrice(text: string): number | null | 'invalid' {
  const t = text.replace(/,/g, '').trim()
  if (t === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid'
  return Number(t)
}

/** "1490.00" / null → what the form field shows. */
export const priceText = (money: string | null) => (money === null ? '' : String(Number(money)))
