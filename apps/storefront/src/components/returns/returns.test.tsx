import type { MyReturnView, ReturnEligibilityView } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OrderReturns } from './order-returns'

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, () => [number, object]> = {}
const ok = (data: unknown): [number, object] => [200, { success: true, data }]

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const method = init.method ?? 'GET'
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const path = url.replace(/^.*\/api\/v1/, '')
      const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k))
      const [status, body] = key ? routes[key]!() : [404, { success: false, message: 'Not found' }]
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const eligible = (over: Partial<ReturnEligibilityView> = {}): ReturnEligibilityView => ({
  canReturn: true,
  reason: null,
  windowClosesAt: '2026-10-12T04:00:00.000Z',
  items: [
    {
      orderItemId: 'i1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      imageUrl: null,
      bought: 2,
      returnable: 2,
    },
    {
      orderItemId: 'i2',
      productName: 'Linen Panjabi',
      variantLabel: '40 / White',
      imageUrl: null,
      bought: 1,
      returnable: 0,
    },
  ],
  ...over,
})
const aReturn = (over: Partial<MyReturnView> = {}): MyReturnView => ({
  id: 'r1',
  orderNumber: 'NW-10001',
  status: 'REQUESTED',
  reason: 'WRONG_SIZE',
  customerNote: null,
  adminNote: null,
  rejectionReason: null,
  refundAmount: null,
  items: [
    {
      orderItemId: 'i1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      imageUrl: null,
      quantity: 1,
      restock: true,
    },
  ],
  createdAt: '2026-10-06T04:00:00.000Z',
  approvedAt: null,
  rejectedAt: null,
  receivedAt: null,
  ...over,
})

describe('returns on the order page', () => {
  it('"Return items" until the window closes; only items that can still go back are offered', async () => {
    routes['GET /returns/my'] = () => ok([])
    routes['GET /returns/eligibility/NW-10001'] = () => ok(eligible())
    render(<OrderReturns orderNumber="NW-10001" />)
    expect(await screen.findByText('You can ask for a return until 12 October 2026.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Return items' }))
    expect(screen.getByRole('checkbox', { name: 'Oxford Shirt (M / Blue)' })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /Linen Panjabi/ })).toBeNull() // already returned
  })

  it('asks for items and a reason before sending; sends exactly what was chosen', async () => {
    routes['GET /returns/my'] = () => ok([])
    routes['GET /returns/eligibility/NW-10001'] = () => ok(eligible())
    routes['POST /returns'] = () => [
      201,
      { success: true, data: aReturn({ items: [{ ...aReturn().items[0]!, quantity: 2 }] }) },
    ]
    render(<OrderReturns orderNumber="NW-10001" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Return items' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a return' }))
    expect(screen.getByText('Choose at least one item to return')).toBeVisible()
    expect(screen.getByText('Choose a reason')).toBeVisible()
    expect(calls.filter((c) => c.method === 'POST')).toEqual([])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Oxford Shirt (M / Blue)' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'How many of Oxford Shirt (M / Blue)' }),
      { target: { value: '2' } },
    )
    fireEvent.change(screen.getByLabelText('Why are you returning it?'), {
      target: { value: 'WRONG_SIZE' },
    })
    fireEvent.change(screen.getByLabelText('Anything else? (optional)'), {
      target: { value: '  Too tight.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a return' }))

    const progress = await screen.findByRole('list', { name: 'Return progress' })
    expect(within(progress).getAllByRole('listitem')[0]).toHaveTextContent('✓ Requested (done)')
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      orderNumber: 'NW-10001',
      items: [{ orderItemId: 'i1', quantity: 2 }],
      reason: 'WRONG_SIZE',
      note: 'Too tight.',
    })
  })

  it('after the window: says why, no button', async () => {
    routes['GET /returns/my'] = () => ok([])
    routes['GET /returns/eligibility/NW-10001'] = () =>
      ok(
        eligible({
          canReturn: false,
          reason: 'The return window for this order closed on 5 October 2026.',
        }),
      )
    render(<OrderReturns orderNumber="NW-10001" />)
    expect(
      await screen.findByText('The return window for this order closed on 5 October 2026.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Return items' })).toBeNull()
  })

  it('progress: instructions once approved, the reason if not accepted, the amount once refunded', async () => {
    routes['GET /returns/my'] = () =>
      ok([
        aReturn({ id: 'a', status: 'APPROVED', adminNote: 'Our courier collects it tomorrow.' }),
        aReturn({ id: 'b', status: 'REJECTED', rejectionReason: 'Worn — tags removed.' }),
        aReturn({ id: 'c', status: 'REFUNDED', refundAmount: '1341' }),
        aReturn({ id: 'd', orderNumber: 'NW-99999', status: 'REFUNDED' }), // another order — not shown here
      ])
    routes['GET /returns/eligibility/NW-10001'] = () =>
      ok(
        eligible({
          canReturn: false,
          reason: 'Everything in this order has already been returned.',
        }),
      )
    render(<OrderReturns orderNumber="NW-10001" />)
    expect(await screen.findByText(/Our courier collects it tomorrow\./)).toBeVisible()
    expect(screen.getByText(/Worn — tags removed\./)).toBeVisible()
    expect(screen.getByText('Refunded ৳1,341.')).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('a newly sent return is added and the item offer updates', async () => {
    routes['GET /returns/my'] = () => ok([])
    let left = 2
    routes['GET /returns/eligibility/NW-10001'] = () =>
      ok(eligible({ items: [{ ...eligible().items[0]!, returnable: left }], canReturn: left > 0 }))
    routes['POST /returns'] = () => {
      left = 1
      return [201, { success: true, data: aReturn() }]
    }
    render(<OrderReturns orderNumber="NW-10001" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Return items' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Oxford Shirt (M / Blue)' }))
    fireEvent.change(screen.getByLabelText('Why are you returning it?'), {
      target: { value: 'DAMAGED' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a return' }))
    await screen.findByRole('article')
    await waitFor(() => expect(calls.filter((c) => c.url.includes('/eligibility/')).length).toBe(2))
  })
})
