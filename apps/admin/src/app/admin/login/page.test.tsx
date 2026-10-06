import { render, screen } from '@testing-library/react'
import LoginPage from './page'

// The sign-in steps themselves are tested in components/sign-in/sign-in-flow.test.tsx.
vi.mock('@/components/sign-in/sign-in-flow', () => ({
  SignInFlow: ({ next }: { next: string }) => <p>sign-in flow → {next}</p>,
}))

// Async Server Component: await it to get the JSX, then render that.
const renderLogin = async (params: { error?: string; next?: string }) =>
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

  it('passes on only a safe "next" page (never an outside site)', async () => {
    await renderLogin({ next: '/admin/orders' })
    expect(screen.getByText('sign-in flow → /admin/orders')).toBeInTheDocument()
  })

  it('an outside "next" falls back to the dashboard', async () => {
    await renderLogin({ next: 'https://evil.com' })
    expect(screen.getByText('sign-in flow → /admin/dashboard')).toBeInTheDocument()
  })
})
