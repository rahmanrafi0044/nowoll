import { z } from 'zod'
import { DISTRICTS, DIVISIONS, isDistrictInDivision } from './bangladesh.js'

// ============================================================================
// Shared validation rules — written ONCE, used by the storefront and admin
// forms (instant feedback for the user) and by the API (the real gatekeeper).
// Zod schemas both CHECK a value and CLEAN it (trim, lowercase, normalize).
// ============================================================================

// ── Phone ────────────────────────────────────────────────────────────────
// Bangladeshi mobile numbers: 01 + operator digit (3–9) + 8 digits.
// Customers type them many ways: "01712345678", "+880 1712-345678", "8801712345678".
// We accept all of them and store ONE format: +8801712345678 (E.164, which
// SSLCommerz and SMS/courier services expect).
const BD_MOBILE_LOCAL = /^01[3-9]\d{8}$/

export const bdPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, '').replace(/^\+?880/, '0'))
  .refine((local) => BD_MOBILE_LOCAL.test(local), {
    message: 'Enter a valid Bangladeshi mobile number, e.g. 01712345678',
  })
  .transform((local) => `+88${local}`)

// ── Email ────────────────────────────────────────────────────────────────
// Lowercased so "Rafi@Nowoll.com" and "rafi@nowoll.com" are the same customer.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }).max(254))

// ── Slug ─────────────────────────────────────────────────────────────────
// The URL-friendly name in /products/oxford-cotton-shirt:
// lowercase letters and digits, single hyphens between words.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX_LENGTH = 120

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(SLUG_MAX_LENGTH, 'Slug is too long')
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only')

/**
 * Turns a name into a slug: "Men's Shirts & Tees" → "mens-shirts-tees".
 * Used by the API to auto-generate slugs, and by the admin UI to preview them.
 * Returns "" when nothing usable is left (e.g. a name written only in Bangla) —
 * the caller decides the fallback.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD') // "é" → "e" + accent mark…
    .replace(/[\u0300-\u036f]/g, '') // …then drop the accent marks
    .toLowerCase()
    .replace(/['’]/g, '') // "men's" → "mens", not "men-s"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-') // everything else becomes a hyphen
    .replace(/^-+|-+$/g, '') // no hyphens at the ends
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '') // slicing may leave a trailing hyphen
}

// ── Money (BDT) ──────────────────────────────────────────────────────────
// Accepts 1499, 1499.5 or "1499.50" (form inputs give strings). At most 2
// decimal places (poisha), never negative, and within the database column
// limit Decimal(12, 2) → max 9,999,999,999.99.
const MAX_BDT = 9_999_999_999.99
const BDT_TEXT = /^\d+(\.\d{1,2})?$/ // digits, optionally "." and 1–2 more digits

// Numbers can't be checked with a pattern: 0.1 + 0.2 is 0.30000000000000004
// in JavaScript. So we check "is it within a hair of a whole number of poisha?".
const hasAtMost2Decimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

export const bdtAmountSchema = z
  .union([
    z.number().refine(Number.isFinite, 'Enter a valid amount'),
    z.string().trim().regex(BDT_TEXT, 'Enter an amount like 1499 or 1499.50').transform(Number),
  ])
  .refine((n) => n >= 0, 'Amount cannot be negative')
  .refine((n) => n <= MAX_BDT, 'Amount is too large')
  .refine(hasAtMost2Decimals, 'Use at most 2 decimal places')
  .transform((n) => Math.round(n * 100) / 100) // drop floating-point noise

// ── Address ──────────────────────────────────────────────────────────────
const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`)

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined)) // "" from an empty form field → undefined

export const addressSchema = z
  .object({
    fullName: requiredText('Full name', 100),
    phone: bdPhoneSchema,
    addressLine1: requiredText('Address'),
    addressLine2: optionalText(),
    area: optionalText(100), // thana / upazila
    district: z.enum(DISTRICTS as [string, ...string[]], { message: 'Choose a district' }),
    division: z.enum(DIVISIONS as [string, ...string[]], { message: 'Choose a division' }),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Postal code must be 4 digits')
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  // A cross-field rule: "Sylhet" district with "Dhaka" division is a typo
  // that would send the parcel to the wrong place (and charge the wrong fee).
  .refine((a) => isDistrictInDivision(a.district, a.division), {
    message: 'This district is not in the selected division',
    path: ['district'],
  })

export type AddressInput = z.input<typeof addressSchema> // what the form sends
export type Address = z.output<typeof addressSchema> // what you get after validation

// ── Pagination ───────────────────────────────────────────────────────────
// For list endpoints: ?page=2&pageSize=20. z.coerce turns the query-string
// "2" into the number 2.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type Pagination = z.output<typeof paginationSchema>
