import type { AdminDiscountDetail, AdminDiscountRow } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describeDiscount, generateCode } from '@/lib/discount-labels'
import * as api from '@/lib/discounts-api'
import { expiresAtFor, firstDayOf, lastDayOf, startsAtFor } from '@/lib/store-days'
import { changedFields, EditDiscount, type Form, NewDiscount, toFields } from './discount-form'
import { DiscountList } from './discount-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/discounts',
}))
vi.mock('@/lib/discounts-api', () => ({
  fetchDiscounts: vi.fn(),
  fetchDiscount: vi.fn(),
  createDiscount: vi.fn(),
  updateDiscount: vi.fn(),
  archiveDiscount: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const ROW: AdminDiscountRow = {
  id: 'd1',
  code: 'EID10',
  description: 'Eid 2026 campaign',
  type: 'PERCENTAGE',
  value: '10',
  minOrderAmount: '2000',
  maxDiscountAmount: '500',
  usageLimit: 100,
  usageLimitPerCustomer: 1,
  usedCount: 12,
  startsAt: '2026-03-31T18:00:00.000Z', // 1 Apr, 00:00 Dhaka
  expiresAt: '2026-04-15T18:00:00.000Z', // the end of 15 Apr in Dhaka
  isActive: true,
  createdAt: '2026-03-20T04:00:00Z',
  status: 'ACTIVE',
  totalDiscounted: '3400',
  salesTotal: '41000',
}
const DETAIL: AdminDiscountDetail = {
  ...ROW,
  usages: [
    {
      orderId: 'o1',
      orderNumber: 'NW-10020',
      customerName: 'Rafi',
      email: 'rafi@example.com',
      amount: '300',
      orderTotal: '2760',
      orderStatus: 'DELIVERED',
      createdAt: '2026-04-02T08:00:00Z',
    },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchDiscounts.mockResolvedValue(
    ok({ items: [ROW], total: 1, page: 1, pageSize: 50, totalPages: 1 }),
  )
  mocked.fetchDiscount.mockResolvedValue(ok(DETAIL))
})

describe('days in Bangladesh time', () => {
  it('first day = 00:00 Dhaka; last day = until the end of that day (the next midnight)', () => {
    expect(startsAtFor('2026-04-01')).toBe('2026-03-31T18:00:00.000Z')
    expect(expiresAtFor('2026-04-15')).toBe('2026-04-15T18:00:00.000Z')
    expect(firstDayOf('2026-03-31T18:00:00.000Z')).toBe('2026-04-01')
    expect(lastDayOf('2026-04-15T18:00:00.000Z')).toBe('2026-04-15')
  })
})

describe('describeDiscount', () => {
  it('says what a code does, in one sentence', () => {
    expect(
      describeDiscount({
        type: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 2000,
        maxDiscountAmount: 500,
        usageLimit: 100,
        usageLimitPerCustomer: 1,
        firstDay: '2026-04-01',
        lastDay: '2026-04-15',
      }),
    ).toBe(
      '10% off orders of ৳2,000 or more, at most ৳500, once per customer, first 100 uses, 1 Apr – 15 Apr.',
    )
    expect(
      describeDiscount({
        type: 'FIXED_AMOUNT',
        value: 200,
        minOrderAmount: null,
        maxDiscountAmount: 999, // ignored for taka-off codes
        usageLimit: null,
        usageLimitPerCustomer: null,
        firstDay: null,
        lastDay: null,
      }),
    ).toBe('৳200 off any order.')
  })

  it('generateCode: readable, no easily-misread characters', () => {
    for (let i = 0; i < 50; i++) expect(generateCode('EID')).toMatch(/^EID-[A-HJ-NP-Z2-9]{4}$/)
  })
})

describe('toFields / changedFields', () => {
  const form = (over: Partial<Form> = {}): Form => ({
    code: 'eid10',
    description: ' Eid ',
    type: 'PERCENTAGE',
    value: '10',
    minOrderAmount: '2,000',
    maxDiscountAmount: '500',
    usageLimit: '',
    usageLimitPerCustomer: '1',
    firstDay: '2026-04-01',
    lastDay: '2026-04-15',
    isActive: true,
    ...over,
  })

  it('upper-cases the code, parses money, turns days into Dhaka instants', () => {
    expect(toFields(form())).toEqual({
      fields: {
        code: 'EID10',
        description: 'Eid',
        type: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 2000,
        maxDiscountAmount: 500,
        usageLimit: null,
        usageLimitPerCustomer: 1,
        startsAt: '2026-03-31T18:00:00.000Z',
        expiresAt: '2026-04-15T18:00:00.000Z',
        isActive: true,
      },
    })
  })

  it('a taka-off code never sends a cap (the API refuses one)', () => {
    const r = toFields(form({ type: 'FIXED_AMOUNT', value: '200' }))
    expect('fields' in r && r.fields.maxDiscountAmount).toBeNull()
  })

  it('problems, before anything is sent', () => {
    const problem = (over: Partial<Form>) => {
      const r = toFields(form(over))
      return 'problem' in r ? r.problem : null
    }
    expect(problem({ code: 'ab' })).toMatch(/3–30/)
    expect(problem({ value: '120' })).toMatch(/at most 100/)
    expect(problem({ value: '' })).toMatch(/percent off/)
    expect(problem({ usageLimit: '0' })).toMatch(/whole numbers/)
    expect(problem({ firstDay: '2026-04-15', lastDay: '2026-04-01' })).toMatch(
      /before the first day/,
    )
  })

  it('changedFields: only what changed', () => {
    const a = toFields(form())
    const b = toFields(form({ value: '15', isActive: false }))
    if (!('fields' in a) || !('fields' in b)) throw new Error('bad test data')
    expect(changedFields(a.fields, b.fields)).toEqual({ value: 15, isActive: false })
  })
})

describe('DiscountList', () => {
  it('rows: code link, sentence, note, status, used of limit, discount given, sales', async () => {
    render(<DiscountList filters={{}} />)
    const link = await screen.findByRole('link', { name: 'EID10' })
    expect(link).toHaveAttribute('href', '/admin/discounts/d1')
    const row = link.closest('tr')!
    expect(row).toHaveTextContent(
      '10% off orders of ৳2,000 or more, at most ৳500, once per customer, first 100 uses, 1 Apr – 15 Apr.',
    )
    expect(row).toHaveTextContent('Eid 2026 campaign')
    expect(row).toHaveTextContent('Active')
    expect(row).toHaveTextContent('12 / 100')
    expect(row).toHaveTextContent('৳3,400')
    expect(row).toHaveTextContent('৳41,000')
  })

  it('status filter → the page address', async () => {
    render(<DiscountList filters={{}} />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SCHEDULED' } })
    expect(push).toHaveBeenLastCalledWith('/admin/discounts?status=SCHEDULED')
  })
})

describe('New code', () => {
  it('generate, % fields, a live sentence, create → opens the code page', async () => {
    mocked.createDiscount.mockResolvedValue(ok({ id: 'new' }))
    render(<NewDiscount />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toMatch(/^SAVE-/)
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'eid10' } })
    fireEvent.change(screen.getByLabelText('Percent off'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('At most (৳)'), { target: { value: '500' } })
    expect(screen.getByText('EID10:').closest('p')).toHaveTextContent(
      'EID10: 10% off any order, at most ৳500.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/discounts/new'))
    expect(mocked.createDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EID10', value: 10, maxDiscountAmount: 500 }),
    )
  })

  it('switching to taka off hides the cap', () => {
    render(<NewDiscount />)
    expect(screen.getByLabelText('At most (৳)')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Taka off (৳)'))
    expect(screen.queryByLabelText('At most (৳)')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Taka off (৳)', { selector: 'input[inputmode]' }),
    ).toBeInTheDocument()
  })
})

describe('Edit code', () => {
  it('a used code: code and type locked, with the reason; other fields editable; sends only changes', async () => {
    mocked.updateDiscount.mockResolvedValue(ok({ id: 'd1' }))
    render(<EditDiscount id="d1" />)
    const code = await screen.findByLabelText('Code')
    expect(code).toBeDisabled()
    expect(screen.getByText(/Locked — this code has been used/)).toBeInTheDocument()
    expect(screen.getByLabelText('Percent off (%)')).toBeDisabled()
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-04-15')
    fireEvent.change(screen.getByLabelText('Total uses'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocked.updateDiscount).toHaveBeenCalledWith('d1', { usageLimit: 200 }),
    )
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('an unused code can still change its code; the orders that used it are listed (linked)', async () => {
    mocked.fetchDiscount.mockResolvedValue(ok({ ...DETAIL, usedCount: 0, usages: [] }))
    render(<EditDiscount id="d1" />)
    expect(await screen.findByLabelText('Code')).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Orders that used it' })).toHaveTextContent(
      'Not used yet.',
    )
  })

  it('orders that used it: number link, customer, status, discount, total', async () => {
    render(<EditDiscount id="d1" />)
    const usages = await screen.findByRole('region', { name: 'Orders that used it' })
    expect(within(usages).getByRole('link', { name: 'NW-10020' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    )
    expect(usages).toHaveTextContent('Delivered')
    expect(usages).toHaveTextContent('−৳300')
  })

  it('archive asks first, then back to the list', async () => {
    mocked.archiveDiscount.mockResolvedValue(ok({ id: 'd1' }))
    render(<EditDiscount id="d1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive…' }))
    expect(mocked.archiveDiscount).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive code' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/discounts'))
  })
})
