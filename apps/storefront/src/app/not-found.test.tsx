import { render, screen } from '@testing-library/react'
import NotFound from './not-found'

describe('404 page', () => {
  it('explains the problem and links back home', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })
})
