import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as api from '@/lib/admin-auth-api'
import { SignInFlow } from './sign-in-flow'

vi.mock('@/lib/admin-auth-api', () => ({
  fetchAdmin: vi.fn(),
  signIn: vi.fn(),
  startEnrolment: vi.fn(),
  verifyCode: vi.fn(),
  signOut: vi.fn(),
}))
const mocked = vi.mocked(api)
const refused = (status: number, message = 'No.', error?: string) =>
  ({ ok: false, status, message, error }) as const
const ADMIN = { id: 'u1', email: 'rafi@nowoll.com', fullName: 'Rafi', role: 'ADMIN' } as const

let replace: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  replace = vi.fn()
  vi.stubGlobal('location', { ...window.location, replace })
  mocked.fetchAdmin.mockResolvedValue(refused(401))
})

const type = (field: RegExp | string | HTMLElement, value: string) =>
  fireEvent.change(field instanceof HTMLElement ? field : screen.getByLabelText(field), {
    target: { value },
  })
async function enterPassword() {
  render(<SignInFlow next="/admin/orders" />)
  type(await screen.findByLabelText('Email'), 'rafi@nowoll.com')
  type('Password', 'secret-password')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('admin sign-in flow', () => {
  it('first time: password → QR code → code → on to the page they wanted', async () => {
    mocked.signIn.mockResolvedValue({ ok: true, data: { next: 'enroll' } })
    mocked.startEnrolment.mockResolvedValue({
      ok: true,
      data: { qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCDEF' },
    })
    mocked.verifyCode.mockResolvedValue({ ok: true, data: { admin: ADMIN } })
    await enterPassword()

    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(screen.getByText('ABCDEF')).toBeInTheDocument()
    expect(mocked.signIn).toHaveBeenCalledWith({
      email: 'rafi@nowoll.com',
      password: 'secret-password',
    })
    type(/^6-digit code/, '123 456')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/orders'))
    expect(mocked.verifyCode).toHaveBeenCalledWith('123456') // spaces removed
  })

  it('later sign-ins: password → code, no QR code', async () => {
    mocked.signIn.mockResolvedValue({ ok: true, data: { next: 'verify' } })
    await enterPassword()
    expect(await screen.findByLabelText(/^6-digit code/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(mocked.startEnrolment).not.toHaveBeenCalled()
  })

  it('a wrong code stays on the code step and says why', async () => {
    mocked.signIn.mockResolvedValue({ ok: true, data: { next: 'verify' } })
    mocked.verifyCode.mockResolvedValue(refused(400, 'That code didn’t work.', 'WRONG_CODE'))
    await enterPassword()
    type(await screen.findByLabelText(/^6-digit code/), '000000')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code didn’t work.')
    expect(screen.getByLabelText(/^6-digit code/)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('checks the code is 6 digits before sending it', async () => {
    mocked.signIn.mockResolvedValue({ ok: true, data: { next: 'verify' } })
    await enterPassword()
    type(await screen.findByLabelText(/^6-digit code/), '12345')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/6-digit code/)
    expect(mocked.verifyCode).not.toHaveBeenCalled()
  })

  it('a non-staff account is refused at the password step', async () => {
    mocked.signIn.mockResolvedValue(refused(403, 'This account doesn’t have admin access.'))
    await enterPassword()
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t have admin access')
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it("the code step's session ran out → back to the password step", async () => {
    mocked.signIn.mockResolvedValue({ ok: true, data: { next: 'verify' } })
    mocked.verifyCode.mockResolvedValue(refused(401, 'Please sign in.'))
    await enterPassword()
    type(await screen.findByLabelText(/^6-digit code/), '123456')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByLabelText('Password')).toBeInTheDocument()
  })

  it('too many tries → a friendly wait message', async () => {
    mocked.signIn.mockResolvedValue(refused(429, 'ThrottlerException'))
    await enterPassword()
    expect(await screen.findByRole('alert')).toHaveTextContent(/wait a minute/)
  })

  it('already fully signed in → straight on, no form', async () => {
    mocked.fetchAdmin.mockResolvedValue({ ok: true, data: { admin: ADMIN } })
    render(<SignInFlow next="/admin/dashboard" />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/dashboard'))
  })
})
