'use client'

import { useSyncExternalStore } from 'react'
import { useCartStore } from '@/stores/cart-store'

/**
 * The saved bag is loaded from the browser AFTER the page appears (see
 * CartHydrator). Until then the bag looks empty — so the cart shows
 * "Loading…" instead of wrongly saying "Your bag is empty".
 * useSyncExternalStore is React's way to read a value that lives outside React.
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useCartStore.persist.onFinishHydration(onChange),
    () => useCartStore.persist.hasHydrated(),
    () => false, // on the server there is no saved bag yet
  )
}
