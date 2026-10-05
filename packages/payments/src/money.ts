// Money helpers. Amounts are compared as whole POISHA (integers), never as
// JavaScript floats — "1550" and "1550.00" must be equal, 1550.1 must not
// equal 1550.10000001.

/** "1550" → 155000, "1550.5" → 155050, "1550.50" → 155050. Null for anything that isn't a plain amount. */
export function toPoisha(amount: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount.trim())
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
}

export const sameAmount = (a: string, b: string): boolean => {
  const pa = toPoisha(a)
  return pa !== null && pa === toPoisha(b)
}

/** "1550" → "1550.00" — the format SSLCommerz expects (decimal(10,2)). */
export const twoDecimals = (amount: string): string => {
  const p = toPoisha(amount)
  if (p === null) throw new Error(`Not an amount: ${amount}`)
  return `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`
}

// SSLCommerz accepts 10.00 – 500,000.00 BDT per payment (official v4 docs).
export const MIN_ONLINE_POISHA = 10_00
export const MAX_ONLINE_POISHA = 500_000_00

/** Decision #3: is this total payable online? Otherwise only cash on delivery. */
export function canPayOnline(amount: string): boolean {
  const p = toPoisha(amount)
  return p !== null && p >= MIN_ONLINE_POISHA && p <= MAX_ONLINE_POISHA
}
