import { Prisma } from '@nowoll/database'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type ApiResult,
  isApiError,
  OrderStatus,
  type Product,
  type Serialized,
  UserRole,
} from './index.js'

describe('ApiResult', () => {
  it('narrows to the error shape with isApiError', () => {
    const res: ApiResult<{ id: string }> = { success: false, error: 'NOT_FOUND', message: 'Nope' }
    expect(isApiError(res)).toBe(true)
    if (!res.success) expectTypeOf(res.error).toEqualTypeOf<string>()
  })

  it('narrows to the data shape on success', () => {
    const res: ApiResult<{ id: string }> = { success: true, data: { id: 'p1' } }
    expect(isApiError(res)).toBe(false)
    if (res.success) expectTypeOf(res.data).toEqualTypeOf<{ id: string }>()
  })
})

describe('Serialized<T>', () => {
  it('turns Decimal and Date fields into strings, leaves the rest alone', () => {
    type P = Serialized<Product>
    expectTypeOf<P['basePrice']>().toEqualTypeOf<string>()
    expectTypeOf<P['compareAtPrice']>().toEqualTypeOf<string | null>()
    expectTypeOf<P['createdAt']>().toEqualTypeOf<string>()
    expectTypeOf<P['name']>().toEqualTypeOf<string>()
    expectTypeOf<P['tags']>().toEqualTypeOf<string[]>()
    expectTypeOf<P['isFeatured']>().toEqualTypeOf<boolean>()
  })

  it('matches what JSON actually does to a Decimal and a Date at runtime', () => {
    const row = { price: new Prisma.Decimal('1499.50'), at: new Date('2026-10-05T00:00:00Z') }
    const json = JSON.parse(JSON.stringify(row)) as Serialized<typeof row>
    expect(json).toEqual({ price: '1499.5', at: '2026-10-05T00:00:00.000Z' })
  })
})

describe('enums', () => {
  it('are usable as runtime values', () => {
    expect(OrderStatus.SHIPPED).toBe('SHIPPED')
    expect(Object.values(UserRole)).toEqual(['CUSTOMER', 'STAFF', 'ADMIN'])
  })
})
