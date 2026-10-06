import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { isToken } from '@/lib/newsletter-api'
import { NewsletterAction } from './newsletter-action'

const TOKEN = 'a'.repeat(64)
let calls: { url: string; body: unknown }[] = []
let answer: [number, object] = [200, { success: true, data: { status: 'SUBSCRIBED' } }]

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve(new Response(JSON.stringify(answer[1]), { status: answer[0] }))
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('newsletter confirm / unsubscribe pages', () => {
  it('opening the page does NOTHING by itself — only the button acts', async () => {
    render(<NewsletterAction kind="confirm" token={TOKEN} />)
    expect(calls).toEqual([]) // an email scanner opening the link changes nothing
    fireEvent.click(screen.getByRole('button', { name: 'Confirm subscription' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You’re subscribed')
    expect(calls).toEqual([
      { url: expect.stringMatching(/\/api\/v1\/subscribers\/confirm$/), body: { token: TOKEN } },
    ])
  })

  it('unsubscribe works the same way', async () => {
    answer = [200, { success: true, data: { status: 'UNSUBSCRIBED' } }]
    render(<NewsletterAction kind="unsubscribe" token={TOKEN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You’re unsubscribed')
    expect(calls[0]!.url).toMatch(/\/subscribers\/unsubscribe$/)
  })

  it('an old or unknown link shows why', async () => {
    answer = [
      404,
      { success: false, error: 'LINK_INVALID', message: 'This link is no longer valid.' },
    ]
    render(<NewsletterAction kind="confirm" token={TOKEN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm subscription' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('This link is no longer valid.'),
    )
  })

  it('a broken link (no token) asks for the email button; tokens are checked before use', () => {
    render(<NewsletterAction kind="confirm" token={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('use the button in the email')
    expect(screen.queryByRole('button')).toBeNull()
    expect(isToken(TOKEN)).toBe(true)
    expect(isToken('abc')).toBe(false)
    expect(isToken(['a'])).toBe(false)
  })
})
