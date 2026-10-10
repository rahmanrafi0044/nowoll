import type { AccountView } from '@nowoll/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountButton } from '@/components/account-button'
import { ContactStep } from '@/components/checkout/contact-step'
import { safeNext } from '@/lib/auth-api'
import { useCheckoutStore } from '@/stores/checkout-store'
import { useSessionStore } from '@/stores/session-store'
import { AccountOverview } from './account-overview'
import { ForgotPasswordForm } from './forgot-password-form'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'
import { ResetPasswordForm } from './reset-password-form'

const RAFI: AccountView = {
  id: 'u1',
  email: 'rafi@example.com',
  fullName: 'Rafi Rahman',
  phone: '+8801712345678',
}

type Call = { url: string; method: string; credentials?: string; body: unknown }
let calls: Call[] = []
let answer: (url: string) => [number, object]
const ok = (data: object): [number, object] => [200, { success: true, data }]
const fail = (status: number, error: string, message: string): [number, object] => [
  status,
  { success: false, error, message },
]

beforeEach(() => {
  calls = []
  answer = (url) =>
    url.endsWith('/auth/me') ? fail(401, 'NOT_SIGNED_IN', 'Please sign in.') : ok({})
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        credentials: init.credentials,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      const [status, body] = answer(url)
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }),
  )
  vi.stubGlobal('location', { ...window.location, replace: vi.fn() })
  useSessionStore.setState({ status: 'unknown', user: null })
})
afterEach(() => vi.unstubAllGlobals())

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('safeNext — never send people off-site after signing in', () => {
  it.each([
    ['/checkout', '/checkout'],
    ['/account?tab=orders', '/account?tab=orders'],
    ['//evil.com', '/account'],
    ['/\\evil.com', '/account'],
    ['https://evil.com', '/account'],
    [null, '/account'],
  ])('%s → %s', (next, expected) => expect(safeNext(next)).toBe(expected))
})

describe('sign in', () => {
  it('sends the details with cookies allowed, then goes where the customer was heading', async () => {
    answer = (url) =>
      url.endsWith('/auth/login')
        ? ok({ user: RAFI })
        : fail(401, 'NOT_SIGNED_IN', 'Please sign in.')
    render(<LoginForm next="/checkout" />)
    type('Email', ' rafi@example.com ')
    type('Password', 'correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/checkout'))
    expect(calls.find((c) => c.url.endsWith('/auth/login'))).toMatchObject({
      method: 'POST',
      credentials: 'include', // the API's HttpOnly cookies are accepted by the browser
      body: { email: 'rafi@example.com', password: 'correct horse battery' },
    })
    expect(useSessionStore.getState().user).toEqual(RAFI)
  })

  it("shows the API's message for wrong details, and a friendly one when rate-limited", async () => {
    answer = (url) =>
      url.endsWith('/auth/login')
        ? fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
        : fail(401, 'NOT_SIGNED_IN', '')
    render(<LoginForm next={null} />)
    type('Email', 'rafi@example.com')
    type('Password', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')

    answer = () => fail(429, 'TOO_MANY_REQUESTS', 'ThrottlerException')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many tries'))
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('an already signed-in visitor is sent straight on (and never off-site)', async () => {
    answer = () => ok({ user: RAFI })
    render(<LoginForm next="//evil.com" />)
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/account'))
  })
})

describe('create an account', () => {
  it('checks the fields with the shared rules before sending anything', () => {
    render(<RegisterForm next={null} />)
    type('Email', 'nope')
    type('Mobile number (optional)', '12345')
    type('Password', '1234567')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter your full name')).toBeVisible()
    expect(screen.getByText('Enter a valid email address')).toBeVisible()
    expect(screen.getByText(/valid Bangladeshi mobile/)).toBeVisible()
    expect(screen.getByText('Use at least 8 characters')).toBeVisible()
    expect(calls.filter((c) => c.url.endsWith('/auth/register'))).toEqual([])
  })

  it('sends a normalised phone (optional) and signs in', async () => {
    answer = (url) =>
      url.endsWith('/auth/register') ? ok({ user: RAFI }) : fail(401, 'NOT_SIGNED_IN', '')
    render(<RegisterForm next={null} />)
    type('Full name', ' Rafi Rahman ')
    type('Email', 'Rafi@Example.com')
    type('Mobile number (optional)', '017 1234-5678')
    type('Password', 'correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/account'))
    expect(calls.find((c) => c.url.endsWith('/auth/register'))!.body).toEqual({
      fullName: 'Rafi Rahman',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      password: 'correct horse battery',
    })
  })

  it('an email that already has an account → suggests signing in', async () => {
    answer = () => fail(409, 'EMAIL_TAKEN', 'An account with this email already exists.')
    render(<RegisterForm next={null} />)
    type('Full name', 'Rafi')
    type('Email', 'rafi@example.com')
    type('Password', 'correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'sign in instead, or reset your password',
    )
  })
})

describe('forgot / reset password', () => {
  it('forgot: the same message whatever the email (no hint whether it has an account)', async () => {
    render(<ForgotPasswordForm />)
    type('Email', 'Someone@Example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      "If someone@example.com has an account, we've sent it a link",
    )
  })

  it('reset: without the emailed link → ask for one', () => {
    render(<ResetPasswordForm tokenHash={null} />)
    expect(screen.getByRole('link', { name: 'Get a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('reset: an expired link offers a new one; a good one signs in and opens the account', async () => {
    answer = () =>
      fail(400, 'RESET_LINK_INVALID', 'This reset link has expired or was already used.')
    render(<ResetPasswordForm tokenHash="hash-1" />)
    type('New password', 'brand new password')
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('link', { name: 'Get a new link' })).toBeVisible()

    answer = () => ok({ user: RAFI })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/account'))
    expect(calls.at(-1)!.body).toEqual({ tokenHash: 'hash-1', password: 'brand new password' })
  })
})

describe('header and account page', () => {
  it('header: "Sign in" for visitors, the first name for customers', async () => {
    const { unmount } = render(<AccountButton />)
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    unmount()
    useSessionStore.setState({ status: 'unknown', user: null })
    answer = () => ok({ user: RAFI })
    render(<AccountButton />)
    const link = await screen.findByRole('link', { name: 'Your account' })
    expect(link).toHaveTextContent('Rafi')
    expect(link).toHaveAttribute('href', '/account')
  })

  it('account page: shows the details; "Sign out" ends the session and goes home', async () => {
    answer = (url) =>
      url.endsWith('/auth/me')
        ? ok({ user: RAFI })
        : url.includes('/orders/my')
          ? ok({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
          : ok({ signedOut: true })
    render(<AccountOverview />)
    expect(await screen.findByText('rafi@example.com')).toBeVisible()
    expect(await screen.findByText('No orders yet.')).toBeVisible() // recent orders (step 23)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith('/'))
    expect(calls.find((c) => c.url.endsWith('/auth/logout'))).toMatchObject({ method: 'POST' })
    expect(useSessionStore.getState().status).toBe('signed-out')
  })

  it('account page: a dead session goes to sign-in', async () => {
    render(<AccountOverview />)
    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith('/login?next=/account'),
    )
  })
})

describe('checkout while signed in', () => {
  beforeEach(() => act(() => useCheckoutStore.getState().reset()))

  it('the contact step starts from the account details', () => {
    useSessionStore.setState({ status: 'signed-in', user: RAFI })
    render(<ContactStep />)
    expect(screen.getByLabelText('Full name')).toHaveValue('Rafi Rahman')
    expect(screen.getByLabelText('Email')).toHaveValue('rafi@example.com')
    expect(screen.getByLabelText('Mobile number', { exact: false })).toHaveValue('+8801712345678')
    expect(screen.getByText(/Signed in as rafi@example.com/)).toBeVisible()
  })

  it('guests get empty fields and a sign-in link back to checkout', () => {
    useSessionStore.setState({ status: 'signed-out', user: null })
    render(<ContactStep />)
    expect(screen.getByLabelText('Full name')).toHaveValue('')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/checkout',
    )
  })
})
