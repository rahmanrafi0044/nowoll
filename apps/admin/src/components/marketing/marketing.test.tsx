import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/marketing-api'
import * as settingsApi from '@/lib/settings-api'
import { MarketingPage } from './marketing-page'

vi.mock('@/lib/marketing-api', () => ({
  fetchMarketingStatus: vi.fn(),
  fetchMetaEvents: vi.fn(),
  sendTestEvent: vi.fn(),
  fetchCatalogFeed: vi.fn(),
}))
vi.mock('@/lib/settings-api', () => ({ saveSettings: vi.fn() }))
const mocked = vi.mocked(api)
const saveSettings = vi.mocked(settingsApi.saveSettings)
const FEED = {
  enabled: false,
  url: 'https://api.nowoll.com/api/v1/feeds/meta-catalog.csv',
  items: 12,
  skipped: [{ id: 'p9', name: 'Linen Kurta', slug: 'linen-kurta', reason: 'No photo' }],
  builtAt: '2026-10-12T06:00:00Z',
}
const ok = <T,>(data: T) => ({ ok: true as const, data })

const STATUS = {
  pixelIdSet: true,
  domainVerificationSet: false,
  tokenSet: false,
  serverEventsOn: true,
  lastSentAt: null,
  lastFailure: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchMarketingStatus.mockResolvedValue(ok(STATUS))
  mocked.fetchMetaEvents.mockResolvedValue(ok([]))
  mocked.fetchCatalogFeed.mockResolvedValue(ok(FEED))
})

describe('Admin → Marketing (step 39b)', () => {
  it('checklist: done / to do, with how to fix — the token is a server step, never typed here', async () => {
    render(<MarketingPage />)
    const list = await screen.findByRole('list', { name: 'Checklist' })
    const item = (text: string) => within(list).getByText(text).closest('li')!
    expect(item('Meta Pixel ID')).toHaveTextContent('Done')
    expect(item('Access token on the server')).toHaveTextContent(
      /To do.*META_CAPI_ACCESS_TOKEN.*never entered here/,
    )
    expect(screen.queryByLabelText(/token/i)).toBeNull() // no box for the secret
    expect(screen.getByText(/none yet/)).toBeInTheDocument()
  })

  it('test event: sends the code, shows Meta’s answer, refreshes the log', async () => {
    mocked.sendTestEvent.mockResolvedValue(ok({ ok: true, eventsReceived: 1, messages: [] }))
    render(<MarketingPage />)
    const button = await screen.findByRole('button', { name: 'Send test event' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Test event code'), { target: { value: ' TEST123 ' } })
    fireEvent.click(button)
    expect(await screen.findByRole('status')).toHaveTextContent(/Meta received it/)
    expect(mocked.sendTestEvent).toHaveBeenCalledWith('TEST123')
    await waitFor(() => expect(mocked.fetchMetaEvents).toHaveBeenCalledTimes(2))
  })

  it('test event refused for the token → says a new token is needed (a server step)', async () => {
    mocked.sendTestEvent.mockResolvedValue(
      ok({ ok: false, message: 'Error validating access token (code 190)', tokenProblem: true }),
    )
    render(<MarketingPage />)
    fireEvent.change(await screen.findByLabelText('Test event code'), {
      target: { value: 'TEST1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send test event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/code 190.*needs replacing/)
  })

  it('log: sent / failed / skipped, test events marked, Meta’s message and trace', async () => {
    mocked.fetchMetaEvents.mockResolvedValue(
      ok([
        {
          id: '1',
          orderNumber: 10001,
          eventName: 'Purchase',
          status: 'SENT' as const,
          test: false,
          eventsReceived: 1,
          message: null,
          fbtraceId: 'AbC',
          createdAt: '2026-10-12T06:00:00Z',
        },
        {
          id: '2',
          orderNumber: 10002,
          eventName: 'OrderDelivered',
          status: 'SKIPPED' as const,
          test: false,
          eventsReceived: null,
          message: 'Server events are switched off (Settings → Marketing and tracking)',
          fbtraceId: null,
          createdAt: '2026-10-12T07:00:00Z',
        },
        {
          id: '3',
          orderNumber: null,
          eventName: 'Purchase',
          status: 'FAILED' as const,
          test: true,
          eventsReceived: null,
          message: 'Invalid parameter (code 100)',
          fbtraceId: null,
          createdAt: '2026-10-12T08:00:00Z',
        },
      ]),
    )
    render(<MarketingPage />)
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows[0]).toHaveTextContent(/Purchase.*NW-10001.*Sent.*Received 1.*Trace: AbC/)
    expect(rows[1]).toHaveTextContent(/OrderDelivered.*NW-10002.*Skipped.*switched off/)
    expect(rows[2]).toHaveTextContent(/Purchase.*Test.*—.*Failed.*code 100/)
  })

  it('catalog feed (step 39c): off → no address; switching on saves the setting and reloads', async () => {
    saveSettings.mockResolvedValue(ok({} as never))
    render(<MarketingPage />)
    const box = await screen.findByRole('region', { name: 'Catalog feed' })
    expect(await within(box).findByText('Off')).toBeInTheDocument()
    expect(within(box).queryByText(FEED.url)).toBeNull()
    expect(within(box).getByText(/12 items/)).toBeInTheDocument()
    mocked.fetchCatalogFeed.mockResolvedValue(ok({ ...FEED, enabled: true }))
    fireEvent.click(within(box).getByRole('button', { name: 'Switch on' }))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ meta_catalog_enabled: true }))
    expect(await within(box).findByText(FEED.url)).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: 'Switch off' })).toBeInTheDocument()
  })

  it('catalog feed: products left out are listed with the reason and a link to fix them', async () => {
    render(<MarketingPage />)
    const list = await screen.findByRole('list', { name: 'Left out of the feed' })
    expect(within(list).getByRole('link', { name: 'Linen Kurta' })).toHaveAttribute(
      'href',
      '/admin/products/p9',
    )
    expect(list).toHaveTextContent('No photo')
  })
})
