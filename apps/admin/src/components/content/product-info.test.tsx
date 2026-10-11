import type { AdminShippingZone } from '@nowoll/types'
import { SETTING_DEFAULTS } from '@nowoll/validation'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/content-api'
import type { AdminContentBlock } from '@/lib/content-api'
import * as settingsApi from '@/lib/settings-api'
import * as shippingApi from '@/lib/shipping-api'
import { ProductInfoEditor } from './product-info-editor'

vi.mock('@/lib/content-api', () => ({
  fetchContentBlock: vi.fn(),
  saveContentBlock: vi.fn(),
  uploadContentImage: vi.fn(),
}))
vi.mock('@/lib/shipping-api', () => ({ fetchZones: vi.fn() }))
vi.mock('@/lib/settings-api', () => ({ fetchSettings: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const zone = (more: Partial<AdminShippingZone>): AdminShippingZone => ({
  id: 'z',
  code: 'Z',
  name: 'Z',
  districts: [],
  isDefault: false,
  fee: '60',
  freeShippingThreshold: null,
  estimatedDaysMin: 1,
  estimatedDaysMax: 3,
  isActive: true,
  updatedAt: '2026-10-11T08:00:00Z',
  ...more,
})
const block = (data: unknown = null, isActive = data !== null): AdminContentBlock => ({
  key: 'product_info',
  data,
  isActive,
  valid: true,
  updatedAt: data === null ? null : '2026-10-11T08:00:00Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(shippingApi.fetchZones).mockResolvedValue(
    ok([
      zone({ name: 'Inside Dhaka' }),
      zone({
        name: 'Outside Dhaka',
        fee: '120',
        isDefault: true,
        estimatedDaysMin: 3,
        estimatedDaysMax: 5,
      }),
      zone({ name: 'Old zone', isActive: false }),
    ]),
  )
  vi.mocked(settingsApi.fetchSettings).mockResolvedValue(
    ok({ ...SETTING_DEFAULTS, return_window_days: 14, cod_max_total: 10_000 }),
  )
  mocked.saveContentBlock.mockImplementation(async (key, data, isActive) =>
    ok({ ...block(data, isActive), key }),
  )
})

const preview = () => within(screen.getByRole('region', { name: 'Preview' }))

describe('product info editor (step 38d)', () => {
  it('nothing saved: starts on, with the automatic lines from the LIVE fees and rules (switched-off zones left out)', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block()))
    render(<ProductInfoEditor />)
    expect(await screen.findByLabelText('Show the box on product pages')).toBeChecked()
    expect(
      preview()
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Inside Dhaka: ৳60 · 1–3 days',
      'Outside Dhaka: ৳120 · 3–5 days',
      'Easy returns within 14 days of delivery',
      'Cash on delivery available (orders up to ৳10,000)',
    ])
  })

  it('switch a line off, add your own line and the Return policy link — saved switched on', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block()))
    render(<ProductInfoEditor />)
    fireEvent.click(await screen.findByLabelText(/Cash on delivery \(from Settings/))
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    fireEvent.change(screen.getByLabelText('Line 1'), { target: { value: '100% cotton' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a link' }))
    expect(preview().getByText('Return policy')).toBeInTheDocument()
    expect(preview().getAllByRole('listitem').at(-1)).toHaveTextContent('100% cotton')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'product_info',
        {
          title: 'Delivery and returns',
          showDelivery: true,
          showReturns: true,
          showCod: false,
          lines: ['100% cotton'],
          link: { label: 'Return policy', href: '/return-policy' },
        },
        true,
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Product pages show it within a minute',
    )
  })

  it('checked before sending: an empty line, a javascript: link', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block()))
    render(<ProductInfoEditor />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a link' }))
    fireEvent.change(screen.getByLabelText('Link address'), {
      target: { value: 'javascript:alert(1)' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your line 1: Write the line')
    expect(alert).toHaveTextContent('Use a path like /return-policy')
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()
  })

  it('saved and hidden: stays off; turning it off says so', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block({}, true)))
    render(<ProductInfoEditor />)
    const show = await screen.findByLabelText('Show the box on product pages')
    expect(show).toBeChecked()
    fireEvent.click(show)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocked.saveContentBlock.mock.calls[0]![2]).toBe(false))
    expect(await screen.findByRole('status')).toHaveTextContent('the box is hidden')
  })
})
