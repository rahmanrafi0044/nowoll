import { fireEvent, render, screen } from '@testing-library/react'
import ErrorPage from './error'

describe('error page', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows a friendly message and the error id, and retries on click', () => {
    const retry = vi.fn()
    const error = Object.assign(new Error('db exploded'), { digest: 'abc123' })
    render(<ErrorPage error={error} retry={retry} />)

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument()
    expect(screen.queryByText(/db exploded/)).not.toBeInTheDocument() // never show raw error text

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
