import { selectItemCount, selectSubtotal, useCartStore } from './cart-store'

const shirtM = {
  variantId: 'v-shirt-m',
  productId: 'p-shirt',
  productName: 'Oxford Shirt',
  productSlug: 'oxford-shirt',
  variantLabel: 'M / Blue',
  sku: 'NW-OXF-M-BLU',
  imageUrl: null,
  unitPrice: 1499.5,
}
const shirtL = { ...shirtM, variantId: 'v-shirt-l', variantLabel: 'L / Blue', sku: 'NW-OXF-L-BLU' }

const state = () => useCartStore.getState()

describe('cart store', () => {
  beforeEach(() => state().clear())

  it('starts empty', () => {
    expect(state().items).toEqual([])
    expect(selectItemCount(state())).toBe(0)
    expect(selectSubtotal(state())).toBe(0)
  })

  it('adds an item with quantity 1 by default', () => {
    state().addItem(shirtM)
    expect(state().items).toEqual([{ ...shirtM, quantity: 1 }])
  })

  it('merges the same variant into one line instead of duplicating it', () => {
    state().addItem(shirtM)
    state().addItem(shirtM, 2)
    expect(state().items).toHaveLength(1)
    expect(state().items[0]?.quantity).toBe(3)
  })

  it('keeps different sizes of the same product as separate lines', () => {
    state().addItem(shirtM)
    state().addItem(shirtL)
    expect(state().items).toHaveLength(2)
  })

  it('ignores a zero or negative add quantity', () => {
    state().addItem(shirtM, 0)
    state().addItem(shirtM, -3)
    expect(state().items).toEqual([])
  })

  it('updates quantity, and removes the line when quantity drops below 1', () => {
    state().addItem(shirtM)
    state().updateQuantity(shirtM.variantId, 4)
    expect(state().items[0]?.quantity).toBe(4)

    state().updateQuantity(shirtM.variantId, 0)
    expect(state().items).toEqual([])
  })

  it('removes an item', () => {
    state().addItem(shirtM)
    state().addItem(shirtL)
    state().removeItem(shirtM.variantId)
    expect(state().items.map((i) => i.variantId)).toEqual([shirtL.variantId])
  })

  it('computes item count and subtotal without floating-point noise', () => {
    state().addItem(shirtM, 3) // 3 × 1499.50
    state().addItem({ ...shirtL, unitPrice: 0.1 }, 2) // 2 × 0.10
    expect(selectItemCount(state())).toBe(5)
    expect(selectSubtotal(state())).toBe(4498.7)
  })

  it('saves the cart to localStorage so it survives a reload', () => {
    state().addItem(shirtM, 2)
    const saved = JSON.parse(localStorage.getItem('nowoll-cart') ?? '{}')
    expect(saved.state.items[0]).toMatchObject({ variantId: shirtM.variantId, quantity: 2 })
  })

  it('restores a saved cart on rehydrate', async () => {
    localStorage.setItem(
      'nowoll-cart',
      JSON.stringify({ state: { items: [{ ...shirtL, quantity: 5 }] }, version: 1 }),
    )
    await useCartStore.persist.rehydrate()
    expect(state().items).toEqual([{ ...shirtL, quantity: 5 }])
  })

  it('remembers a discount code, clears it with the bag, and saves only items + code', () => {
    state().addItem(shirtM)
    state().setDiscountCode('SAVE10')
    const saved = JSON.parse(localStorage.getItem('nowoll-cart') ?? '{}')
    expect(Object.keys(saved.state).sort()).toEqual(['discountCode', 'items'])
    state().clear()
    expect(state().discountCode).toBeNull()
  })

  it("updates a line with today's details", () => {
    state().addItem(shirtM)
    state().syncLine(shirtM.variantId, { unitPrice: 1290 })
    expect(state().items[0]).toMatchObject({ unitPrice: 1290, quantity: 1, sku: shirtM.sku })
  })
})
