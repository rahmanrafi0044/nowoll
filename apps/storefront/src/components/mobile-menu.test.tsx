import type { CategoryNode } from '@nowoll/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { MobileMenu } from './mobile-menu'

const node = (name: string, children: CategoryNode[] = []): CategoryNode => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  description: null,
  imageUrl: null,
  imageAlt: null,
  seoTitle: null,
  seoDescription: null,
  children,
})

describe('<MobileMenu />', () => {
  const categories = [node('Men', [node('Shirts')]), node('Women')]

  it('opens and closes, telling screen readers its state', () => {
    render(<MobileMenu categories={categories} />)
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Shirts' })).toHaveAttribute('href', '/shop/shirts')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('closes when a link is chosen', () => {
    render(<MobileMenu categories={categories} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: 'Women' }))
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
