import { create } from 'zustand'

// Temporary UI state shared across components (not saved anywhere):
// the bag drawer can be opened from the header icon AND from "Add to bag".
/** What was just put in the bag — the drawer says "Added to bag" (38f). */
export interface JustAdded {
  productName: string
  variantLabel: string
  imageUrl: string | null
}

interface UiState {
  cartOpen: boolean
  justAdded: JustAdded | null
  /** Pass what was added to show "Added to bag"; nothing = just open the bag. */
  openCart: (added?: JustAdded) => void
  closeCart: () => void
  /** Listing pages (38f): more products per row (true) or bigger photos. */
  gridDense: boolean
  setGridDense: (dense: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  cartOpen: false,
  justAdded: null,
  openCart: (added) => set({ cartOpen: true, justAdded: added ?? null }),
  closeCart: () => set({ cartOpen: false, justAdded: null }),
  gridDense: true,
  setGridDense: (dense) => set({ gridDense: dense }),
}))
