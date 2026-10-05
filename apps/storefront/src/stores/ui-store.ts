import { create } from 'zustand'

// Temporary UI state shared across components (not saved anywhere):
// the bag drawer can be opened from the header icon AND from "Add to bag".
interface UiState {
  cartOpen: boolean
  openCart: () => void
  closeCart: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  cartOpen: false,
  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
}))
