import { describe, expect, it } from 'vitest'
import {
  addToCartEvent,
  beginCheckoutEvent,
  newEventId,
  purchaseEvent,
  purchaseEventId,
  recordTrackedOrder,
  type TrackedItem,
  viewItemEvent,
} from './events.js'

const shirt: TrackedItem = {
  productId: 'p-oxford',
  sku: 'NW-OXF-M-BLU',
  name: 'Oxford Shirt',
  variant: 'M / Blue',
  price: 1490,
  quantity: 2,
}
const tee: TrackedItem = {
  productId: 'p-tee',
  sku: 'NW-TEE-L-BLK',
  name: 'Basic Tee',
  variant: 'L / Black',
  price: 499.9,
  quantity: 1,
}

describe('shopping events (official field names)', () => {
  it('product page → GA4 view_item and Meta ViewContent for the whole product (product_group)', () => {
    expect(
      viewItemEvent({ productId: 'p-oxford', name: 'Oxford Shirt', price: 1490 }, 'e1'),
    ).toEqual({
      ga4: {
        name: 'view_item',
        params: {
          currency: 'BDT',
          value: 1490,
          items: [{ item_id: 'p-oxford', item_name: 'Oxford Shirt', price: 1490, quantity: 1 }],
        },
      },
      meta: {
        name: 'ViewContent',
        data: {
          content_ids: ['p-oxford'],
          content_type: 'product_group',
          content_name: 'Oxford Shirt',
          value: 1490,
          currency: 'BDT',
        },
        eventId: 'e1',
      },
    })
  })

  it('add to bag → GA4 by product (with the size as variant), Meta by SKU (the catalog id)', () => {
    const e = addToCartEvent(shirt, 'e2')
    expect(e.ga4).toEqual({
      name: 'add_to_cart',
      params: {
        currency: 'BDT',
        value: 2980,
        items: [
          {
            item_id: 'p-oxford',
            item_name: 'Oxford Shirt',
            item_variant: 'M / Blue',
            price: 1490,
            quantity: 2,
          },
        ],
      },
    })
    expect(e.meta).toEqual({
      name: 'AddToCart',
      data: {
        content_ids: ['NW-OXF-M-BLU'],
        content_type: 'product',
        contents: [{ id: 'NW-OXF-M-BLU', quantity: 2, item_price: 1490 }],
        content_name: 'Oxford Shirt',
        value: 2980,
        currency: 'BDT',
      },
      eventId: 'e2',
    })
  })

  it('checkout → value rounded to paisa, Meta counts the pieces (num_items)', () => {
    const e = beginCheckoutEvent([shirt, { ...tee, quantity: 3 }], 'e3')
    expect(e.ga4.params.value).toBe(4479.7) // 2980 + 1499.7, not 4479.700000000001
    expect(e.meta).toMatchObject({
      name: 'InitiateCheckout',
      data: { content_ids: ['NW-OXF-M-BLU', 'NW-TEE-L-BLK'], num_items: 5, value: 4479.7 },
    })
  })

  it('purchase → the order total, order number as transaction/order id, ID the server can rebuild', () => {
    const e = purchaseEvent({
      orderNumber: 'NW-10001',
      items: [shirt, { ...tee, productId: null }],
      total: 3559.9,
      shipping: 80,
      tax: 0,
      coupon: 'EID10',
    })
    expect(e.ga4).toEqual({
      name: 'purchase',
      params: {
        transaction_id: 'NW-10001',
        currency: 'BDT',
        value: 3559.9,
        tax: 0,
        shipping: 80,
        coupon: 'EID10',
        items: [
          {
            item_id: 'p-oxford',
            item_name: 'Oxford Shirt',
            item_variant: 'M / Blue',
            price: 1490,
            quantity: 2,
          },
          // a deleted product still has its SKU
          {
            item_id: 'NW-TEE-L-BLK',
            item_name: 'Basic Tee',
            item_variant: 'L / Black',
            price: 499.9,
            quantity: 1,
          },
        ],
      },
    })
    expect(e.meta).toEqual({
      name: 'Purchase',
      data: {
        content_ids: ['NW-OXF-M-BLU', 'NW-TEE-L-BLK'],
        content_type: 'product',
        contents: [
          { id: 'NW-OXF-M-BLU', quantity: 2, item_price: 1490 },
          { id: 'NW-TEE-L-BLK', quantity: 1, item_price: 499.9 },
        ],
        num_items: 3,
        order_id: 'NW-10001',
        value: 3559.9,
        currency: 'BDT',
      },
      eventId: 'purchase-NW-10001',
    })
    expect(purchaseEventId('NW-10001')).toBe('purchase-NW-10001')
  })

  it('no coupon → no coupon field (GA4 would show an empty one)', () => {
    const e = purchaseEvent({
      orderNumber: 'NW-1',
      items: [shirt],
      total: 2980,
      shipping: 0,
      tax: 0,
      coupon: null,
    })
    expect(e.ga4.params).not.toHaveProperty('coupon')
  })

  it('event ids are unique', () => {
    expect(newEventId()).not.toBe(newEventId())
  })
})

describe('purchase counted once per order', () => {
  it('new order → the list to save; same order again → null', () => {
    const first = recordTrackedOrder(null, 'NW-10001')
    expect(JSON.parse(first!)).toEqual(['NW-10001'])
    expect(recordTrackedOrder(first, 'NW-10001')).toBeNull()
    expect(JSON.parse(recordTrackedOrder(first, 'NW-10002')!)).toEqual(['NW-10001', 'NW-10002'])
  })

  it('a broken saved list starts again; only the last 50 are kept', () => {
    expect(JSON.parse(recordTrackedOrder('{oops', 'NW-1')!)).toEqual(['NW-1'])
    const many = JSON.stringify(Array.from({ length: 50 }, (_, i) => `NW-${i}`))
    const next = JSON.parse(recordTrackedOrder(many, 'NW-new')!) as string[]
    expect(next).toHaveLength(50)
    expect(next[0]).toBe('NW-1')
    expect(next.at(-1)).toBe('NW-new')
  })
})
