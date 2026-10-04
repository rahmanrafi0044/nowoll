import { render, screen } from '@testing-library/react'
import LoginPage from './page'

// Async Server Component: await it to get the JSX, then render that.
const renderLogin = async (params: { error?: string }) =>
  render(await LoginPage({ searchParams: Promise.resolve(params) }))

describe('admin login page', () => {
  it('renders without an error by default', async () => {
    await renderLogin({})
    expect(screen.getByRole('heading', { name: 'Nowoll Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains why access was refused', async () => {
    await renderLogin({ error: 'forbidden' })
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn’t have admin access/)
  })
})
