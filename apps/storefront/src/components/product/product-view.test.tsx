import { render, screen } from '@testing-library/react'
import { productDetail, variant } from '@/test-utils/fixtures'
import { ProductView } from './product-view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The saved (pre-built) page says everything is sold out; the shop restocked
// since. The page must switch to the LIVE stock (GET /variants/product/:id).
const soldOutSaved = productDetail({
  variants: [variant('w-m', 'White', 'M', false), variant('b-m', 'Blue', 'M', false)],
})

describe('<ProductView /> live stock', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the saved stock at once, then the live stock (restocked → Add to bag)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: [variant('w-m', 'White', 'M', true), variant('b-m', 'Blue', 'M', false)],
          }),
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<ProductView product={soldOutSaved} />)
    // Saved page: the chosen size is sold out → "Notify me" instead of Add to bag.
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeInTheDocument()
    // Live stock arrives: it's back → Add to bag, no "Notify me".
    expect((await screen.findAllByRole('button', { name: 'Add to bag' }))[0]).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Notify me' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/variants/product/p1',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('the live check failing (offline) keeps the saved stock — no error shown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    render(<ProductView product={soldOutSaved} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
