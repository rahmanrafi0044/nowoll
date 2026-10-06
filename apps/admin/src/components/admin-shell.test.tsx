import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '@/lib/admin-auth-api'
import { AdminShell } from './admin-shell'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/orders' }))
vi.mock('@/lib/admin-auth-api', () => ({ fetchAdmin: vi.fn(), signOut: vi.fn() }))
const mocked = vi.mocked(api)

let replace: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  replace = vi.fn()
  vi.stubGlobal('location', { ...window.location, replace })
})
const shell = () =>
  render(
    <AdminShell>
      <p>Secret admin page</p>
    </AdminShell>,
  )

describe('AdminShell', () => {
  it('shows the page only after the API confirms staff + 2FA', async () => {
    mocked.fetchAdmin.mockResolvedValue({
      ok: true,
      data: { admin: { id: 'u', email: 'r@nowoll.com', fullName: 'Rafi', role: 'STAFF' } },
    })
    shell()
    expect(screen.queryByText('Secret admin page')).not.toBeInTheDocument()
    expect(await screen.findByText('Secret admin page')).toBeInTheDocument()
    expect(screen.getByText('Rafi · Staff')).toBeInTheDocument()
  })

  it('401 → sign-in, remembering the page; the page is never shown', async () => {
    mocked.fetchAdmin.mockResolvedValue({ ok: false, status: 401, message: 'Please sign in.' })
    shell()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login?next=%2Fadmin%2Forders'))
    expect(screen.queryByText('Secret admin page')).not.toBeInTheDocument()
  })

  it('403 (not staff / banned) → sign-in with an explanation', async () => {
    mocked.fetchAdmin.mockResolvedValue({ ok: false, status: 403, message: 'No.' })
    shell()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/admin/login?next=%2Fadmin%2Forders&error=forbidden'),
    )
  })

  it('API unreachable → says so (and shows nothing secret)', async () => {
    mocked.fetchAdmin.mockResolvedValue({ ok: false, status: 0, message: 'Could not connect.' })
    shell()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect.')
    expect(screen.queryByText('Secret admin page')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('sign out → API logout, then the sign-in page', async () => {
    mocked.fetchAdmin.mockResolvedValue({
      ok: true,
      data: { admin: { id: 'u', email: 'r@nowoll.com', fullName: null, role: 'ADMIN' } },
    })
    mocked.signOut.mockResolvedValue({ ok: true, data: { signedOut: true } })
    shell()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login'))
    expect(mocked.signOut).toHaveBeenCalled()
  })
})
