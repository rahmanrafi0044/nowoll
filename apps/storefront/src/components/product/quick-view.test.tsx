import { fireEvent, render, screen } from '@testing-library/react'
import { productDetail } from '@/test-utils/fixtures'
import { QuickView } from './quick-view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('<QuickView />', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the product only when opened, then shows the size/color picker', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: productDetail() }))),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<QuickView slug="oxford-shirt" name="Oxford Shirt" />)
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Quick view: Oxford Shirt' }))
    expect(await screen.findByRole('button', { name: 'Choose a size' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View full details' })).toHaveAttribute(
      'href',
      '/products/oxford-shirt',
    )
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/v1/products/oxford-shirt')
  })

  it('shows an error if the product cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    render(<QuickView slug="x" name="X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Quick view: X' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn.t load/)
  })
})
