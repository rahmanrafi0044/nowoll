import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/redirects-api'
import { RedirectsPage } from './redirects-page'

vi.mock('@/lib/redirects-api', () => ({
  fetchRedirects: vi.fn(),
  createRedirect: vi.fn(),
  updateRedirect: vi.fn(),
  deleteRedirect: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const row = (over: Partial<api.AdminRedirect> = {}): api.AdminRedirect => ({
  id: 'r1',
  fromPath: '/about',
  toPath: '/our-story',
  permanent: true,
  isActive: true,
  source: 'AUTO',
  createdAt: '2026-10-14T06:00:00Z',
  updatedAt: '2026-10-14T06:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchRedirects.mockResolvedValue(ok([row()]))
})

describe('Admin → Content → Redirects (step 43c)', () => {
  it('lists redirects: old → new, on/off, 301/302, automatic', async () => {
    render(<RedirectsPage />)
    const item = (await screen.findByText('/about')).closest('li')!
    expect(item).toHaveTextContent(/\/about→\/our-story.*On.*Permanent \(301\).*Automatic/)
  })

  it('add: checked first (other websites and checkout refused), then sent; a shortened chain is explained', async () => {
    mocked.createRedirect.mockResolvedValue(
      ok(row({ id: 'r2', fromPath: '/a', toPath: '/c', source: 'MANUAL' })),
    )
    render(<RedirectsPage />)
    const form = await screen.findByRole('form', { name: 'Add a redirect' })
    fireEvent.change(within(form).getByLabelText('Old address'), { target: { value: '/checkout' } })
    fireEvent.change(within(form).getByLabelText('New address'), {
      target: { value: 'https://evil.example' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Add redirect' }))
    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent(/can’t be redirected/)
    expect(alert).toHaveTextContent(/other websites aren’t allowed/)
    expect(mocked.createRedirect).not.toHaveBeenCalled()

    fireEvent.change(within(form).getByLabelText('Old address'), { target: { value: '/a' } })
    fireEvent.change(within(form).getByLabelText('New address'), { target: { value: '/b' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add redirect' }))
    await waitFor(() =>
      expect(mocked.createRedirect).toHaveBeenCalledWith({
        fromPath: '/a',
        toPath: '/b',
        permanent: true,
        isActive: true,
      }),
    )
    expect(await within(form).findByRole('status')).toHaveTextContent(/goes straight to \/c/)
  })

  it('edit (switch off) and remove (asks first)', async () => {
    mocked.updateRedirect.mockResolvedValue(ok(row({ isActive: false })))
    mocked.deleteRedirect.mockResolvedValue(ok({ deleted: true as const }))
    render(<RedirectsPage />)
    const item = (await screen.findByText('/about')).closest('li')!
    fireEvent.click(within(item).getByRole('button', { name: 'Edit' }))
    const edit = screen.getByRole('form', { name: 'Edit /about' })
    fireEvent.click(within(edit).getByRole('checkbox', { name: 'On' }))
    fireEvent.click(within(edit).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.updateRedirect).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ isActive: false }),
      ),
    )

    const again = (await screen.findByText('/about')).closest('li')!
    fireEvent.click(within(again).getByRole('button', { name: 'Remove' }))
    expect(mocked.deleteRedirect).not.toHaveBeenCalled()
    expect(again).toHaveTextContent(/will show “Page not found”/)
    fireEvent.click(within(again).getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(mocked.deleteRedirect).toHaveBeenCalledWith('r1'))
  })

  it('search asks the API again', async () => {
    render(<RedirectsPage />)
    fireEvent.change(await screen.findByLabelText('Search addresses'), {
      target: { value: ' eid ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(mocked.fetchRedirects).toHaveBeenLastCalledWith('eid'))
  })
})
