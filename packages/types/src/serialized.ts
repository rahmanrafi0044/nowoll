import type { Prisma } from '@nowoll/database'

// ============================================================================
// Serialized<T> — what a database row looks like AFTER it travels as JSON.
//
// JSON has no Date or Decimal type, so on the way from API to browser:
//   Date            → ISO string, e.g. "2026-10-05T08:30:00.000Z"
//   Prisma.Decimal  → string,     e.g. "1499.5"  (money stays exact; never a float)
//
// So the frontend can write `Serialized<Product>` instead of hand-copying
// every model — and stays in sync with schema.prisma automatically.
// (A "mapped + conditional type": it walks every field and converts it.)
// ============================================================================
export type Serialized<T> = T extends Prisma.Decimal
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T
