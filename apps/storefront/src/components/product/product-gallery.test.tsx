import { fireEvent, render, screen } from '@testing-library/react'
import { ProductGallery } from './product-gallery'

const images = [
  { id: '1', url: '/a.webp', altText: 'Front', variantId: null },
  { id: '2', url: '/b.webp', altText: 'Back', variantId: null },
]

describe('<ProductGallery />', () => {
  it('switches the main photo from the thumbnails', () => {
    render(<ProductGallery images={images} productName="Shirt" />)
    expect(screen.getByRole('img', { name: 'Front' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2' }))
    expect(screen.getByRole('img', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show photo 2' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('opens the photo large when clicked (zoom)', () => {
    render(<ProductGallery images={images} productName="Shirt" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Front' }))
    expect(screen.getByRole('dialog', { name: 'Shirt' })).toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
  })

  it('shows a placeholder without photos', () => {
    render(<ProductGallery images={[]} productName="Shirt" />)
    expect(screen.getByText('No photo')).toBeInTheDocument()
  })
})
