import { render, waitFor } from '@testing-library/react'
import { useCartStore } from '@/stores/cart-store'
import { CartHydrator } from './cart-hydrator'

describe('<CartHydrator />', () => {
  it('loads the saved cart from localStorage after mounting', async () => {
    useCartStore.getState().clear()
    localStorage.setItem(
      'nowoll-cart',
      JSON.stringify({
        state: {
          items: [
            {
              variantId: 'v1',
              productId: 'p1',
              productName: 'Tee',
              productSlug: 'tee',
              variantLabel: 'S / Black',
              sku: 'NW-TEE-S-BLK',
              imageUrl: null,
              unitPrice: 599,
              quantity: 2,
            },
          ],
        },
        version: 1,
      }),
    )

    render(<CartHydrator />)

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1))
  })
})
