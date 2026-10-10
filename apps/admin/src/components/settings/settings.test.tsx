import { SETTING_DEFAULTS } from '@nowoll/validation'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/settings-api'
import { SettingsPage } from './settings-form'

vi.mock('@/lib/settings-api', () => ({ fetchSettings: vi.fn(), saveSettings: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const SAVED = { ...SETTING_DEFAULTS, store_phone: '+8801712345678', vat_rate: 5 }

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchSettings.mockResolvedValue(ok(SAVED))
  mocked.saveSettings.mockImplementation(async (values) =>
    ok({ ...SAVED, ...values } as typeof SAVED),
  )
})

const field = (section: string, label: string) =>
  within(screen.getByRole('region', { name: section })).getByLabelText(label)

describe('Admin → Settings', () => {
  it('shows what is saved (phones as 01…); Save is off until something changes', async () => {
    render(<SettingsPage />)
    expect(await screen.findByLabelText('Store name')).toHaveValue('Nowoll')
    expect(field('Contact', 'Phone')).toHaveValue('01712345678')
    expect(field('Orders and stock', 'VAT (%)')).toHaveValue('5')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('sends only what changed, cleaned and typed (numbers as numbers)', async () => {
    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('Store name'), { target: { value: 'Nowoll BD' } })
    fireEvent.change(field('Contact', 'WhatsApp number'), { target: { value: '01812-345678' } })
    fireEvent.change(field('Orders and stock', 'VAT (%)'), { target: { value: '7.5' } })
    fireEvent.change(field('Shop page', 'Products per page'), { target: { value: '36' } })
    expect(screen.getByText('4 unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(mocked.saveSettings).toHaveBeenCalledWith({
        store_name: 'Nowoll BD',
        store_whatsapp: '+8801812345678',
        vat_rate: 7.5,
        shop_page_size: 36,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(field('Contact', 'WhatsApp number')).toHaveValue('01812345678')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('checked before sending: a look-alike social link, VAT over 100, an empty name', async () => {
    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('Store name'), { target: { value: '' } })
    fireEvent.change(field('Social media', 'Facebook page'), {
      target: { value: 'https://facebook.com.evil.example/x' },
    })
    fireEvent.change(field('Orders and stock', 'VAT (%)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Store name: Write the store name')
    expect(alert).toHaveTextContent(
      'Facebook page: Use the https:// link of your page on facebook.com',
    )
    expect(alert).toHaveTextContent('VAT (%)')
    expect(mocked.saveSettings).not.toHaveBeenCalled()
  })

  it('a number box left empty is refused, not saved as 0', async () => {
    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('Return window (days)'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Return window (days)')
    expect(mocked.saveSettings).not.toHaveBeenCalled()
  })

  it('the API’s refusal is listed', async () => {
    mocked.saveSettings.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'INVALID_SETTINGS',
      message: 'Some settings need fixing — see the list.',
      details: ['store_email: Enter a valid email address'],
    })
    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('Tagline'), { target: { value: 'new tagline' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'store_email: Enter a valid email address',
    )
  })
})
