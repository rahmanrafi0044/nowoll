import { describe, expect, it } from 'vitest'
import {
  addressSchema,
  bdPhoneSchema,
  bdtAmountSchema,
  emailSchema,
  paginationSchema,
  slugSchema,
  slugify,
} from './schemas.js'

describe('bdPhoneSchema', () => {
  it.each([
    '01712345678',
    '+8801712345678',
    '8801712345678',
    '+880 1712-345678',
    ' 017 1234 5678 ',
    '(+880) 1712345678',
  ])('accepts %s and normalizes it to +8801712345678', (input) => {
    expect(bdPhoneSchema.parse(input)).toBe('+8801712345678')
  })

  it.each([
    ['too short', '0171234567'],
    ['too long', '017123456789'],
    ['invalid operator digit', '01212345678'],
    ['landline', '029876543'],
    ['letters', '01712abc678'],
    ['foreign number', '+447911123456'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(bdPhoneSchema.safeParse(input).success).toBe(false)
  })
})

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Rafi@Nowoll.COM ')).toBe('rafi@nowoll.com')
  })

  it.each(['rafi', 'rafi@', '@nowoll.com', 'rafi @nowoll.com', ''])('rejects %j', (input) => {
    expect(emailSchema.safeParse(input).success).toBe(false)
  })
})

describe('slugSchema', () => {
  it.each(['oxford-shirt', 'tee', 'summer-2026', 'a1-b2-c3'])('accepts %s', (s) => {
    expect(slugSchema.parse(s)).toBe(s)
  })

  it.each([
    'Oxford-Shirt',
    'oxford shirt',
    'oxford--shirt',
    '-shirt',
    'shirt-',
    'shirt_1',
    'শার্ট',
    '',
  ])('rejects %j', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false)
  })
})

describe('bdtAmountSchema', () => {
  it.each([
    [1499, 1499],
    [1499.5, 1499.5],
    ['1499.50', 1499.5],
    [' 60 ', 60],
    [0, 0],
    [0.1 + 0.2, 0.3], // floating-point noise is cleaned up, not rejected
  ])('accepts %j as %d', (input, expected) => {
    expect(bdtAmountSchema.parse(input)).toBe(expected)
  })

  it.each([
    ['negative', -1],
    ['3 decimals (number)', 10.005],
    ['3 decimals (text)', '10.005'],
    ['thousands separator', '1,499'],
    ['currency symbol', '৳1499'],
    ['scientific notation', '1e3'],
    ['too large', 10_000_000_000],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(bdtAmountSchema.safeParse(input).success).toBe(false)
  })
})

describe('addressSchema', () => {
  const valid = {
    fullName: '  Rafi Rahman ',
    phone: '01712345678',
    addressLine1: 'House 12, Road 5',
    addressLine2: '',
    area: 'Dhanmondi',
    district: 'Dhaka',
    division: 'Dhaka',
    postalCode: '1205',
  }

  it('accepts a valid address, trimming text, normalizing the phone and dropping empty optionals', () => {
    expect(addressSchema.parse(valid)).toEqual({
      fullName: 'Rafi Rahman',
      phone: '+8801712345678',
      addressLine1: 'House 12, Road 5',
      addressLine2: undefined,
      area: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
      postalCode: '1205',
    })
  })

  it('allows a missing or empty postal code', () => {
    expect(addressSchema.parse({ ...valid, postalCode: '' }).postalCode).toBeUndefined()
    const { postalCode: _omit, ...withoutPostal } = valid
    expect(addressSchema.parse(withoutPostal).postalCode).toBeUndefined()
  })

  it('rejects a district that is not in the chosen division, pointing at the district field', () => {
    const result = addressSchema.safeParse({ ...valid, district: 'Sylhet', division: 'Dhaka' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['district'])
  })

  it('rejects unknown districts and divisions', () => {
    expect(addressSchema.safeParse({ ...valid, district: 'Chittagong' }).success).toBe(false)
    expect(addressSchema.safeParse({ ...valid, division: 'Narnia' }).success).toBe(false)
  })

  it('reports every missing required field with a readable message', () => {
    const result = addressSchema.safeParse({ ...valid, fullName: ' ', addressLine1: '' })
    const messages = result.error?.issues.map((i) => i.message)
    expect(messages).toEqual(
      expect.arrayContaining(['Full name is required', 'Address is required']),
    )
  })

  it('rejects a bad postal code', () => {
    expect(addressSchema.safeParse({ ...valid, postalCode: '12A5' }).success).toBe(false)
  })
})

describe('paginationSchema', () => {
  it('applies defaults', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('converts query-string text to numbers', () => {
    expect(paginationSchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 })
  })

  it('caps pageSize at 100 and rejects page 0', () => {
    expect(paginationSchema.safeParse({ pageSize: '500' }).success).toBe(false)
    expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('slugify', () => {
  it.each([
    ['Men', 'men'],
    ["Men's Shirts & Tees", 'mens-shirts-and-tees'],
    ['  Summer   Collection 2026 ', 'summer-collection-2026'],
    ['Café Crème', 'cafe-creme'],
    ['T-Shirts / Polos', 't-shirts-polos'],
    ['---Hello---', 'hello'],
    ['শার্ট', ''], // Bangla only → empty; the caller picks a fallback
    ['Panjabi শার্ট', 'panjabi'],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('always produces a valid slug (or empty)', () => {
    for (const name of ['A & B', "It's 100% cotton!", 'x'.repeat(300) + ' y', 'Ünïcödé']) {
      const slug = slugify(name)
      expect(slug === '' || slugSchema.safeParse(slug).success).toBe(true)
    }
  })
})
