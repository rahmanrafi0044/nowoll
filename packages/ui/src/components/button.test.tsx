import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button.js'

describe('<Button />', () => {
  it('renders a primary, medium button by default', () => {
    render(<Button>Add to cart</Button>)
    const button = screen.getByRole('button', { name: 'Add to cart' })
    expect(button).toHaveClass('bg-brand', 'h-11')
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('can still be a submit button when asked', () => {
    render(<Button type="submit">Place order</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('applies variant, size, fullWidth and extra classes', () => {
    render(
      <Button variant="danger" size="lg" fullWidth className="mt-4">
        Delete
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass('bg-danger', 'h-12', 'w-full', 'mt-4')
  })

  it('calls onClick, but not when disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('forwards a ref to the real <button>', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Go</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})
