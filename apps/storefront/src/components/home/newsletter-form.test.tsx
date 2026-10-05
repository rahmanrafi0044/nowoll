import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewsletterForm } from './newsletter-form'

const respond = (status: number, body: unknown) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))

describe('<NewsletterForm />', () => {
  afterEach(() => vi.unstubAllGlobals())

  const submit = (email: string) => {
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
  }

  it('checks the email in the browser first, without calling the API', async () => {
    const fetchMock = respond(201, {})
    vi.stubGlobal('fetch', fetchMock)
    render(<NewsletterForm />)
    submit('not-an-email')
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the normalized email and shows the confirmation message', async () => {
    const fetchMock = respond(201, {
      success: true,
      data: { message: "Thanks — we'll confirm by email soon." },
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<NewsletterForm />)
    submit('  Rafi@Nowoll.com ')
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Thanks — we'll confirm by email soon.",
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/subscribers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'rafi@nowoll.com', source: 'homepage' }),
      }),
    )
  })

  it('explains rate limiting', async () => {
    vi.stubGlobal(
      'fetch',
      respond(429, { success: false, error: 'TOO_MANY_REQUESTS', message: 'x' }),
    )
    render(<NewsletterForm />)
    submit('a@b.com')
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again in a minute/)
  })

  it('handles a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    render(<NewsletterForm />)
    submit('a@b.com')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not connect/)
  })

  it('disables the button while sending (no double sign-ups)', async () => {
    let resolve!: (r: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    )
    render(<NewsletterForm />)
    submit('a@b.com')
    expect(await screen.findByRole('button', { name: 'Signing up…' })).toBeDisabled()
    resolve(
      new Response(JSON.stringify({ success: true, data: { message: 'ok' } }), { status: 201 }),
    )
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  })
})
