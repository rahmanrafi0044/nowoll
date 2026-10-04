import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// One line in the cart. We store enough to DISPLAY the cart without an API call.
// IMPORTANT: these prices are for display only. At checkout the API re-reads
// every price and stock level from the database — a customer editing
// localStorage to make a shirt cost ৳1 achieves nothing.
export interface CartItem {
  variantId: string
  productId: string
  productName: string
  productSlug: string
  variantLabel: string // e.g. "M / Blue"
  sku: string
  imageUrl: string | null
  unitPrice: number // BDT
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  updateQuantity: (variantId: string, quantity: number) => void
  removeItem: (variantId: string) => void
  clear: () => void
}

// ZUSTAND STORE: a small global state container any component can read with
// `useCartStore((s) => s.items)`. Components re-render only when the slice
// they selected changes.
//
// `persist` saves the cart to localStorage so it survives page reloads and
// browser restarts. (Storing a cart there is fine — auth tokens never go there.)
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (item, quantity = 1) =>
        set((state) => {
          if (quantity < 1) return state
          const existing = state.items.find((i) => i.variantId === item.variantId)
          if (existing) {
            // Same size/color already in the cart → increase quantity instead of a duplicate line
            return {
              items: state.items.map((i) =>
                i.variantId === item.variantId ? { ...i, quantity: i.quantity + quantity } : i,
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity }] }
        }),

      updateQuantity: (variantId, quantity) =>
        set((state) => ({
          items:
            quantity < 1
              ? state.items.filter((i) => i.variantId !== variantId)
              : state.items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
        })),

      removeItem: (variantId) =>
        set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'nowoll-cart',
      version: 1, // bump if CartItem's shape changes, and add a `migrate` function
      storage: createJSONStorage(() => localStorage),
      // Don't read localStorage during server rendering — the server has no
      // localStorage, and mixing the two causes React "hydration mismatch"
      // errors. <CartHydrator /> loads the saved cart once the page is in the browser.
      skipHydration: true,
    },
  ),
)

// SELECTORS: derived values computed from state, kept out of the store so
// they can never get out of sync with `items`.
export const selectItemCount = (state: Pick<CartState, 'items'>) =>
  state.items.reduce((sum, i) => sum + i.quantity, 0)

export const selectSubtotal = (state: Pick<CartState, 'items'>) =>
  // Round to whole poisha to avoid floating-point noise like 1499.9999999
  Math.round(state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) * 100) / 100
