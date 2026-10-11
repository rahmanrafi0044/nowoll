import type { AdminStaffPage } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/staff-api'
import { StaffPage } from './staff-page'

vi.mock('@/lib/staff-api', () => ({
  fetchStaff: vi.fn(),
  addStaff: vi.fn(),
  changeStaffRole: vi.fn(),
  removeStaff: vi.fn(),
  resetStaffTwoFactor: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const PAGE: AdminStaffPage = {
  members: [
    {
      id: 'me',
      email: 'rafi@nowoll.com',
      fullName: 'Rafi',
      role: 'ADMIN',
      twoFactor: true,
      isYou: true,
      accountCreatedAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'h1',
      email: 'helper@nowoll.com',
      fullName: 'Helper',
      role: 'STAFF',
      twoFactor: false,
      isYou: false,
      accountCreatedAt: '2026-10-05T08:00:00Z',
    },
  ],
  changes: [
    {
      id: 'c1',
      action: 'GRANTED',
      fromRole: 'CUSTOMER',
      toRole: 'STAFF',
      createdAt: '2026-10-10T08:00:00Z',
      actor: { fullName: 'Rafi', email: 'rafi@nowoll.com' },
      target: { fullName: 'Helper', email: 'helper@nowoll.com' },
    },
    {
      id: 'c2',
      action: 'TWO_FACTOR_RESET',
      fromRole: null,
      toRole: null,
      createdAt: '2026-10-09T08:00:00Z',
      actor: null,
      target: { fullName: 'Rafi', email: 'rafi@nowoll.com' },
    },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchStaff.mockResolvedValue(ok(PAGE))
  mocked.changeStaffRole.mockResolvedValue(ok({ id: 'h1' }))
  mocked.removeStaff.mockResolvedValue(ok({ id: 'h1' }))
  mocked.resetStaffTwoFactor.mockResolvedValue(ok({ id: 'h1' }))
})

const row = async (name: string) =>
  within(await screen.findByRole('list', { name: 'Staff members' }))
    .getByText(name)
    .closest('li')!

describe('Staff page (step 38e)', () => {
  it('who has access, their role and 2FA; you can’t change yourself', async () => {
    render(<StaffPage />)
    const me = within(await row('Rafi'))
    expect(me.getByText('(you)')).toBeInTheDocument()
    expect(me.queryByRole('combobox')).toBeNull()
    expect(me.queryByRole('button', { name: 'Remove access' })).toBeNull()
    const helper = within(await row('Helper'))
    expect(helper.getByText(/Sets up the authenticator at first sign-in/)).toBeInTheDocument()
    expect(helper.getByLabelText('Role for Helper')).toHaveValue('STAFF')
  })

  it('the change log says who did what — or "a server command"', async () => {
    render(<StaffPage />)
    const log = within(await screen.findByRole('region', { name: 'Change log' }))
    expect(log.getByText(/given admin access as Staff/)).toBeInTheDocument()
    expect(log.getAllByRole('listitem')[0]).toHaveTextContent('by Rafi')
    expect(log.getAllByRole('listitem')[1]).toHaveTextContent(
      'authenticator app reset by a server command',
    )
  })

  it('add someone by their shop account email; refusals are shown', async () => {
    mocked.addStaff
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        error: 'NO_ACCOUNT',
        message: 'There’s no shop account with this email. Ask them to sign up on the shop first.',
      })
      .mockResolvedValueOnce(ok({ id: 'n1' }))
    render(<StaffPage />)
    const add = within(await screen.findByRole('region', { name: 'Add staff' }))
    fireEvent.click(add.getByRole('button', { name: 'Add' }))
    expect(await add.findByRole('alert')).toHaveTextContent('Enter the email')
    fireEvent.change(add.getByLabelText('Email of their shop account'), {
      target: { value: 'new@nowoll.com' },
    })
    fireEvent.change(add.getByLabelText('Role'), { target: { value: 'ADMIN' } })
    fireEvent.click(add.getByRole('button', { name: 'Add' }))
    expect(await add.findByRole('alert')).toHaveTextContent('sign up on the shop first')
    fireEvent.click(add.getByRole('button', { name: 'Add' }))
    expect(await add.findByRole('status')).toHaveTextContent(
      'new@nowoll.com can now sign in to the admin panel as Admin',
    )
    expect(mocked.addStaff).toHaveBeenLastCalledWith('new@nowoll.com', 'ADMIN')
    await waitFor(() => expect(mocked.fetchStaff).toHaveBeenCalledTimes(2))
  })

  it('change role straight away; remove and reset ask first', async () => {
    render(<StaffPage />)
    const helper = within(await row('Helper'))
    fireEvent.change(helper.getByLabelText('Role for Helper'), { target: { value: 'ADMIN' } })
    await waitFor(() => expect(mocked.changeStaffRole).toHaveBeenCalledWith('h1', 'ADMIN'))

    fireEvent.click(helper.getByRole('button', { name: 'Remove access' }))
    const confirm = within(screen.getByRole('group', { name: 'Confirm removing Helper' }))
    expect(confirm.getByText(/their account and orders stay/)).toBeInTheDocument()
    fireEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
    expect(mocked.removeStaff).not.toHaveBeenCalled()
    fireEvent.click(helper.getByRole('button', { name: 'Remove access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove access' }))
    await waitFor(() => expect(mocked.removeStaff).toHaveBeenCalledWith('h1'))

    fireEvent.click(helper.getByRole('button', { name: 'Reset authenticator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset' }))
    await waitFor(() => expect(mocked.resetStaffTwoFactor).toHaveBeenCalledWith('h1'))
  })

  it('a refusal (e.g. two admins at the same moment) is shown on that person', async () => {
    mocked.changeStaffRole.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'STAFF_CHANGED',
      message: 'Someone changed staff at the same moment. Reload the page and try again.',
    })
    render(<StaffPage />)
    const helper = within(await row('Helper'))
    fireEvent.change(helper.getByLabelText('Role for Helper'), { target: { value: 'ADMIN' } })
    expect(await helper.findByRole('alert')).toHaveTextContent('Reload the page and try again')
  })

  it('Staff who open this page see "Only an admin" — not a sign-out', async () => {
    mocked.fetchStaff.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'ADMIN_ONLY',
      message: 'Only an admin can do this. Ask an admin if it needs changing.',
    })
    const replace = vi.fn()
    vi.stubGlobal('location', { ...window.location, replace, pathname: '/admin/staff' })
    render(<StaffPage />)
    expect(await screen.findByText(/Only an admin can do this/)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
