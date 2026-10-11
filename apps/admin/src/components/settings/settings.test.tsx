import { SETTING_DEFAULTS } from '@nowoll/validation'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/settings-api'
import { SettingsPage } from './settings-form'

vi.mock('@/lib/settings-api', () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
  uploadBrandImage: vi.fn(),
  fetchPaymentStatus: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const SAVED = { ...SETTING_DEFAULTS, store_phone: '+8801712345678', vat_rate: 5 }

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchSettings.mockResolvedValue(ok(SAVED))
  mocked.fetchPaymentStatus.mockResolvedValue(ok({ onlineConfigured: true }))
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

describe('Look (step 38, part 2)', () => {
  const look = () => within(screen.getByRole('region', { name: 'Look' }))

  it('pictures: uploaded to the right place, then saved with the settings', async () => {
    mocked.uploadBrandImage.mockResolvedValue(
      ok({ url: 'https://x.supabase.co/branding/logo-1.png' }),
    )
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    const file = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' })
    fireEvent.change(look().getByLabelText('Logo'), { target: { files: [file] } })
    await waitFor(() => expect(mocked.uploadBrandImage).toHaveBeenCalledWith('logo', file))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(mocked.saveSettings).toHaveBeenCalledWith({
        logo_url: 'https://x.supabase.co/branding/logo-1.png',
      }),
    )
  })

  it('brand colour: a ready-made one, with a preview; saved', async () => {
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    expect(look().getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(look().getByRole('button', { name: 'Navy' }))
    expect(look().getByRole('button', { name: 'Navy' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      look().getByText(/Readable: white text on it has \d+\.\d:1 contrast/),
    ).toBeInTheDocument()
    expect(look().getByLabelText('Colour preview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(mocked.saveSettings).toHaveBeenCalledWith({ brand_color: '#1e3a8a' }),
    )
  })

  it('your own colour: too light → explained, no preview, refused before sending', async () => {
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    fireEvent.change(look().getByLabelText('Colour code'), { target: { value: '#ffff00' } })
    expect(
      look().getByText(/Too light: white text on it has only 1\.\d:1 contrast/),
    ).toBeInTheDocument()
    expect(look().queryByLabelText('Colour preview')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Brand colour: Too light')
    expect(mocked.saveSettings).not.toHaveBeenCalled()
  })

  it('font: the preview uses it (English and Bangla); saved', async () => {
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    fireEvent.change(look().getByLabelText('Font'), { target: { value: 'hind_siliguri' } })
    expect(look().getByLabelText('Font preview')).toHaveTextContent('ঈদের নতুন পাঞ্জাবি')
    expect((look().getByLabelText('Font preview') as HTMLElement).style.fontFamily).toContain(
      'var(--font-hind-siliguri)',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(mocked.saveSettings).toHaveBeenCalledWith({ font: 'hind_siliguri' }))
  })
})

describe('Payments (step 38c)', () => {
  const pay = () => within(screen.getByRole('region', { name: 'Payments' }))

  it('switch cash on delivery off, set a limit and a minimum — sent as a switch and numbers', async () => {
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    fireEvent.click(pay().getByLabelText(/Cash on delivery — offered at checkout/))
    fireEvent.change(pay().getByLabelText('Cash-on-delivery limit (৳)'), {
      target: { value: '10000' },
    })
    fireEvent.change(pay().getByLabelText('Minimum order (৳)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(mocked.saveSettings).toHaveBeenCalledWith({
        payment_cod_enabled: false,
        cod_max_total: 10000,
        min_order_amount: 500,
      }),
    )
  })

  it('both ways to pay off → refused before sending', async () => {
    render(<SettingsPage />)
    await screen.findByLabelText('Store name')
    fireEvent.click(pay().getByLabelText(/Cash on delivery — offered/))
    fireEvent.click(pay().getByLabelText(/Online payment \(SSLCommerz\) — offered/))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('keep at least one way to pay')
    expect(mocked.saveSettings).not.toHaveBeenCalled()
  })

  it('a limit emptied again means "no limit" (saved as 0), shown empty', async () => {
    mocked.fetchSettings.mockResolvedValue(ok({ ...SAVED, cod_max_total: 10000 }))
    render(<SettingsPage />)
    const limit = await screen.findByLabelText('Cash-on-delivery limit (৳)')
    expect(limit).toHaveValue('10000')
    fireEvent.change(limit, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(mocked.saveSettings).toHaveBeenCalledWith({ cod_max_total: 0 }))
  })

  it('online on but not set up on the server → a warning (keys are developer-side)', async () => {
    mocked.fetchPaymentStatus.mockResolvedValue(ok({ onlineConfigured: false }))
    render(<SettingsPage />)
    expect(await screen.findByRole('note')).toHaveTextContent('isn’t set up on the server yet')
    fireEvent.click(pay().getByLabelText(/Online payment \(SSLCommerz\) — offered/))
    expect(screen.queryByRole('note')).toBeNull()
  })
})
