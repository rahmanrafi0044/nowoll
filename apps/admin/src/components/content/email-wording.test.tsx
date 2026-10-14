import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/email-wording-api'
import { EmailWordingEditor } from './email-wording-editor'

vi.mock('@/lib/email-wording-api', () => ({
  fetchEmailWording: vi.fn(),
  saveEmailWording: vi.fn(),
  clearEmailWording: vi.fn(),
  sendTestEmail: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const block = (data: unknown) => ({
  key: 'email_wording' as const,
  data,
  isActive: !!data,
  valid: true,
  updatedAt: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchEmailWording.mockResolvedValue(ok(block(null)))
})

const section = (name: RegExp) => screen.getByText(name).closest('details')!

describe('Admin → Content → Emails (step 43b)', () => {
  it('each email shows the built-in wording as a hint, its placeholders and what stays fixed', async () => {
    render(<EmailWordingEditor />)
    const shipped = (await screen.findByText('Order shipped')).closest('details')!
    expect(within(shipped).getByLabelText('Subject')).toHaveAttribute(
      'placeholder',
      'Order {order} is on its way',
    )
    expect(shipped).toHaveTextContent(/\{name\} \{order\} \{store\}/)
    expect(shipped).toHaveTextContent(
      /Always included \(not editable\): the order number, courier and tracking number/,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('save: checked first (an unknown placeholder is named), then sent cleaned', async () => {
    mocked.saveEmailWording.mockResolvedValue(ok(block({})))
    render(<EmailWordingEditor />)
    const shipped = (await screen.findByText('Order shipped')).closest('details')!
    fireEvent.change(within(shipped).getByLabelText('Subject'), { target: { value: 'Hi {nmae}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Order shipped › subject: “\{nmae\}” isn’t known here/,
    )
    expect(mocked.saveEmailWording).not.toHaveBeenCalled()

    fireEvent.change(within(shipped).getByLabelText('Subject'), {
      target: { value: ' {order} is coming, {name}! ' },
    })
    fireEvent.change(screen.getByLabelText('Footer line'), { target: { value: 'Nowoll · Dhaka' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Show the logo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.saveEmailWording).toHaveBeenCalledWith({
        footer: 'Nowoll · Dhaka',
        showLogo: true,
        emails: {
          'order-shipped': { subject: '{order} is coming, {name}!', heading: '', intro: '' },
        },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved/)
  })

  it('"Send me a test" sends what is on screen (even unsaved) and says where it went', async () => {
    mocked.sendTestEmail.mockResolvedValue(ok({ sentTo: 'rafi@nowoll.com' }))
    render(<EmailWordingEditor />)
    const refund = (await screen.findByText('Refund sent')).closest('details')!
    fireEvent.change(within(refund).getByLabelText('Opening paragraph'), {
      target: { value: 'Sorry it didn’t work out.' },
    })
    fireEvent.click(within(refund).getByRole('button', { name: 'Send me a test' }))
    await waitFor(() =>
      expect(mocked.sendTestEmail).toHaveBeenCalledWith(
        'refund-processed',
        expect.objectContaining({
          emails: {
            'refund-processed': { subject: '', heading: '', intro: 'Sorry it didn’t work out.' },
          },
        }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/Test sent to rafi@nowoll.com/)
  })

  it('saved wording is shown (its email opened); "Back to built-in" asks first', async () => {
    mocked.fetchEmailWording.mockResolvedValue(
      ok(
        block({
          footer: 'x',
          showLogo: false,
          emails: { welcome: { subject: 'Hello {name}', heading: '', intro: '' } },
        }),
      ),
    )
    mocked.clearEmailWording.mockResolvedValue(ok(block(null)))
    render(<EmailWordingEditor />)
    const welcome = (await screen.findByText(/Welcome \(new account\)/)).closest('details')!
    expect(welcome).toHaveAttribute('open')
    expect(within(welcome).getByLabelText('Subject')).toHaveValue('Hello {name}')
    fireEvent.click(screen.getByRole('button', { name: 'Back to built-in wording' }))
    expect(mocked.clearEmailWording).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(mocked.clearEmailWording).toHaveBeenCalled())
    expect(within(section(/Welcome \(new account\)/)).getByLabelText('Subject')).toHaveValue('')
  })
})
