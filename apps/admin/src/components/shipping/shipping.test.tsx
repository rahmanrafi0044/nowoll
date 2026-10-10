import type { AdminShippingZone } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/shipping-api'
import { EditZone, NewZone } from './zone-form'
import { ZoneList } from './zone-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/shipping',
}))
vi.mock('@/lib/shipping-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/shipping-api')>()),
  fetchZones: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
}))
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
  updatedAt: '2026-10-10T08:00:00Z',
  ...more,
})
const DHAKA = zone({
  id: 'z1',
  code: 'DHAKA',
  name: 'Inside Dhaka',
  districts: ['Dhaka'],
  freeShippingThreshold: '3000',
})
const SUBURBS = zone({
  id: 'z3',
  code: 'SUB',
  name: 'Dhaka suburbs',
  districts: ['Gazipur'],
  fee: '90',
  isActive: false,
})
const OUTSIDE = zone({
  id: 'z2',
  code: 'OUT',
  name: 'Outside Dhaka',
  fee: '120',
  isDefault: true,
  estimatedDaysMin: 3,
  estimatedDaysMax: 5,
})
const ZONES = [DHAKA, SUBURBS, OUTSIDE]

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchZones.mockResolvedValue(ok(ZONES))
})

describe('zone list', () => {
  it('fees, free-from, days, districts, default and on/off', async () => {
    render(<ZoneList />)
    const dhaka = (await screen.findByRole('link', { name: 'Inside Dhaka' })).closest('tr')!
    expect(dhaka).toHaveTextContent('৳60')
    expect(dhaka).toHaveTextContent('৳3,000')
    expect(dhaka).toHaveTextContent('1–3 days')
    expect(within(dhaka).getByText('On')).toBeInTheDocument()
    const outside = screen.getByRole('link', { name: 'Outside Dhaka' }).closest('tr')!
    expect(outside).toHaveTextContent('All other districts')
    expect(within(outside).getByText('Default')).toBeInTheDocument()
    expect(
      within(screen.getByRole('link', { name: 'Dhaka suburbs' }).closest('tr')!).getByText('Off'),
    ).toBeInTheDocument()
  })

  it('“Which zone delivers to…?” uses the checkout rule: a switched-off zone’s districts fall to the default', async () => {
    render(<ZoneList />)
    const select = await screen.findByLabelText(/Which zone delivers to/)
    fireEvent.change(select, { target: { value: 'Dhaka' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Inside Dhaka — ৳60 (free on orders of ৳3,000 or more), 1–3 days.',
    )
    fireEvent.change(select, { target: { value: 'Gazipur' } }) // in Dhaka suburbs, which is off
    expect(screen.getByRole('status')).toHaveTextContent('Outside Dhaka — ৳120, 3–5 days.')
  })
})

describe('new zone', () => {
  it('districts ticked from the official list (search, where each one is now); created → back to the list', async () => {
    mocked.createZone.mockResolvedValue(ok(zone({ id: 'new' })))
    render(<NewZone />)
    fireEvent.change(await screen.findByLabelText('Name (shown at checkout)'), {
      target: { value: 'Dhaka suburbs 2' },
    })
    fireEvent.change(screen.getByLabelText('Delivery fee (৳)'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Find a district'), { target: { value: 'narayan' } })
    const dhakaDivision = within(screen.getByRole('group', { name: 'Dhaka division' }))
    expect(dhakaDivision.getAllByRole('checkbox')).toHaveLength(1)
    fireEvent.click(dhakaDivision.getByLabelText('Narayanganj'))
    fireEvent.change(screen.getByLabelText('Find a district'), { target: { value: '' } })
    expect(screen.getByText('(in Inside Dhaka)')).toBeInTheDocument() // next to Dhaka
    fireEvent.click(screen.getByRole('button', { name: 'Create zone' }))
    await waitFor(() =>
      expect(mocked.createZone).toHaveBeenCalledWith({
        name: 'Dhaka suburbs 2',
        fee: 90,
        freeShippingThreshold: null,
        estimatedDaysMin: null,
        estimatedDaysMax: null,
        districts: ['Narayanganj'],
        isActive: true,
        isDefault: false,
      }),
    )
    expect(push).toHaveBeenCalledWith('/admin/shipping')
  })

  it('checked before sending: fee, free-from, days', async () => {
    render(<NewZone />)
    fireEvent.change(await screen.findByLabelText('Name (shown at checkout)'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByLabelText('Delivery fee (৳)'), { target: { value: '60.555' } })
    fireEvent.change(screen.getByLabelText('Free delivery from (৳)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Delivery time: from (days)'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('to (days)'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create zone' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fee: at most 2 decimals')
    expect(alert).toHaveTextContent('Free delivery from')
    expect(alert).toHaveTextContent('“from” can’t be more days than “to”')
    expect(mocked.createZone).not.toHaveBeenCalled()
  })

  it('no districts → warned that no customer gets it', async () => {
    render(<NewZone />)
    expect(await screen.findByText(/no customer will get this zone/)).toBeInTheDocument()
  })
})

describe('edit zone', () => {
  it('a district from another zone: the API asks first, then “Move them here and save”', async () => {
    mocked.updateZone
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: 'DISTRICT_IN_OTHER_ZONE',
        message: 'Some districts are already in another zone. Move them here?',
        details: ['Gazipur is in Dhaka suburbs'],
      })
      .mockResolvedValueOnce(
        ok({ ...DHAKA, districts: ['Dhaka', 'Gazipur'], updatedAt: '2026-10-10T09:00:00Z' }),
      )
    render(<EditZone id="z1" />)
    const save = await screen.findByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/Gazipur/))
    fireEvent.click(save)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Gazipur is in Dhaka suburbs')
    expect(mocked.updateZone.mock.calls[0]![1]).not.toHaveProperty('moveDistricts')
    fireEvent.click(within(alert).getByRole('button', { name: 'Move them here and save' }))
    await waitFor(() =>
      expect(mocked.updateZone).toHaveBeenLastCalledWith(
        'z1',
        expect.objectContaining({ districts: ['Dhaka', 'Gazipur'], moveDistricts: true }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('the default zone: always on, can’t stop being default here, needs no districts', async () => {
    render(<EditZone id="z2" />)
    expect(await screen.findByLabelText(/Default zone/)).toBeDisabled()
    expect(screen.getByLabelText(/Default zone/)).toBeChecked()
    expect(screen.getByLabelText(/On — offered at checkout/)).toBeDisabled()
    expect(screen.getByText(/you don’t need to tick any here/)).toBeInTheDocument()
  })

  it('making another zone the default says which one it replaces, and keeps it on', async () => {
    render(<EditZone id="z3" />)
    fireEvent.click(await screen.findByLabelText(/Default zone/))
    expect(screen.getByText(/instead of “Outside Dhaka”/)).toBeInTheDocument()
    expect(screen.getByLabelText(/On — offered at checkout/)).toBeDisabled()
  })

  it('ticking then unticking a district is not an unsaved change', async () => {
    render(<EditZone id="z1" />)
    const box = await screen.findByLabelText(/^Bogura/)
    fireEvent.click(box)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(box)
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.click(screen.getByLabelText('Dhaka'))
    fireEvent.click(screen.getByLabelText('Dhaka'))
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('unticking and re-ticking the FIRST of two districts keeps the official order (no false “unsaved”)', async () => {
    mocked.fetchZones.mockResolvedValue(
      ok([{ ...DHAKA, districts: ['Dhaka', 'Narayanganj'] }, OUTSIDE]),
    )
    render(<EditZone id="z1" />)
    const dhaka = await screen.findByLabelText('Dhaka')
    fireEvent.click(dhaka)
    fireEvent.click(dhaka)
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })
})
