'use client'

import { useEffect } from 'react'
import { useCartStore } from '@/stores/cart-store'

// Loads the saved cart from localStorage after the page reaches the browser.
// Renders nothing — it's mounted once in the root layout.
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate()
  }, [])
  return null
}
