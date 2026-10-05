// Sorts clothing sizes the way shoppers expect, not alphabetically:
//   letter sizes  XXS < XS < S < M < L < XL < XXL < 3XL …
//   numbers       28 < 30 < 38 < 40 (waist / chest sizes)
//   kids ranges   2-3Y < 4-5Y < 10-11Y (by the first number)
// Letter sizes come first, then numbers, then age ranges, then anything else A→Z.
const LETTER_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL']
const ALIASES: Record<string, string> = { '2XL': 'XXL', '3XL': 'XXXL', '2XS': 'XXS', '3XS': 'XXXS' }

function rank(size: string): [number, number, string] {
  const s = size.trim().toUpperCase()
  const letter = LETTER_ORDER.indexOf(ALIASES[s] ?? s)
  if (letter !== -1) return [0, letter, s]
  if (/^\d+(\.\d+)?$/.test(s)) return [1, Number(s), s]
  const range = /^(\d+)\s*-\s*\d+\s*(Y|YRS?|YEARS?|M|MONTHS?)?$/.exec(s)
  if (range) return [2, Number(range[1]) * (range[2]?.startsWith('M') ? 1 / 12 : 1), s]
  return [3, 0, s]
}

export function compareSizes(a: string, b: string): number {
  const [ga, na, sa] = rank(a)
  const [gb, nb, sb] = rank(b)
  return ga - gb || na - nb || sa.localeCompare(sb)
}
