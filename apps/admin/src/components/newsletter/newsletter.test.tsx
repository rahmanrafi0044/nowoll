import type { AdminSubscribersPage, NewsletterSyncStatus } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/newsletter-api'
import { NewsletterPage } from './newsletter-page'

vi.mock('@/lib/newsletter-api', () => ({
  fetchSubscribers: vi.fn(),
  fetchNewsletterSync: vi.fn(),
  syncEveryone: vi.fn(),
  unsubscribeSubscriber: vi.fn(),
  eraseSubscriber: vi.fn(),
  exportSubscribersCsv: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const PAGE: AdminSubscribersPage = {
  counts: { subscribed: 2, pending: 1, unsubscribed: 0, newLast30Days: 2 },
  items: [
    {
      id: 's1',
      email: 'rafi@example.com',
      status: 'SUBSCRIBED',
      source: 'footer',
      createdAt: '2026-10-01T06:00:00Z',
      confirmedAt: '2026-10-01T06:05:00Z',
      unsubscribedAt: null,
      resendSyncedAt: '2026-10-01T06:06:00Z',
      resendError: null,
    },
    {
      id: 's2',
      email: 'mita@example.com',
      status: 'PENDING',
      source: 'checkout',
      createdAt: '2026-10-02T06:00:00Z',
      confirmedAt: null,
      unsubscribedAt: null,
      resendSyncedAt: null,
      resendError: 'Resend refused the API key — it needs "Full access" for contacts',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
}
const SYNC: NewsletterSyncStatus = {
  enabled: true,
  segmentSet: true,
  webhookSet: false,
  synced: 1,
  waiting: 1,
  failed: 1,
  lastError: 'Resend refused the API key — it needs "Full access" for contacts',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchSubscribers.mockResolvedValue(ok(PAGE))
  mocked.fetchNewsletterSync.mockResolvedValue(ok(SYNC))
})

describe('Admin → Newsletter (step 42)', () => {
  it('counts, the list with status, where they signed up, and the Resend state per person', async () => {
    render(<NewsletterPage />)
    const counts = await screen.findByRole('list', { name: 'Subscribers' })
    expect(counts).toHaveTextContent(/Confirmed2.*Waiting for confirmation1/)
    const rafi = screen.getByText('rafi@example.com').closest('tr')!
    expect(rafi).toHaveTextContent(/Confirmed.*Footer.*Up to date/)
    const mita = screen.getByText('mita@example.com').closest('tr')!
    expect(mita).toHaveTextContent(/Waiting for confirmation.*Checkout.*Full access/)
  })

  it('Resend box: what is done, what is left (the webhook is a server step), "Sync everyone now"', async () => {
    mocked.syncEveryone.mockResolvedValue(ok({ queued: true }))
    render(<NewsletterPage />)
    const setup = await screen.findByRole('list', { name: 'Resend setup' })
    expect(
      within(setup)
        .getByText(/webhook/)
        .closest('li'),
    ).toHaveTextContent(/To do.*RESEND_WEBHOOK_SECRET/)
    expect(screen.getByText(/1 failed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sync everyone now' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Started/)
  })

  it('"Sync everyone now" is off until copying is switched on with a segment', async () => {
    mocked.fetchNewsletterSync.mockResolvedValue(ok({ ...SYNC, enabled: false }))
    render(<NewsletterPage />)
    expect(await screen.findByRole('button', { name: 'Sync everyone now' })).toBeDisabled()
  })

  it('search and filter ask the API again', async () => {
    render(<NewsletterPage />)
    fireEvent.change(await screen.findByLabelText('Search by email'), {
      target: { value: ' rafi ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(mocked.fetchSubscribers).toHaveBeenLastCalledWith({ page: 1, q: 'rafi' }),
    )
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'PENDING' } })
    await waitFor(() =>
      expect(mocked.fetchSubscribers).toHaveBeenLastCalledWith({
        page: 1,
        q: 'rafi',
        status: 'PENDING',
      }),
    )
  })

  it('unsubscribe; delete only after a clear confirmation (it cannot be undone)', async () => {
    mocked.unsubscribeSubscriber.mockResolvedValue(ok({ status: 'UNSUBSCRIBED' as const }))
    mocked.eraseSubscriber.mockResolvedValue(ok({ deleted: true as const }))
    const confirm = vi.spyOn(window, 'confirm')
    render(<NewsletterPage />)
    const rafi = (await screen.findByText('rafi@example.com')).closest('tr')!
    fireEvent.click(within(rafi).getByRole('button', { name: 'Unsubscribe' }))
    await waitFor(() => expect(mocked.unsubscribeSubscriber).toHaveBeenCalledWith('s1'))

    confirm.mockReturnValueOnce(false)
    fireEvent.click(within(rafi).getByRole('button', { name: 'Delete' }))
    expect(mocked.eraseSubscriber).not.toHaveBeenCalled()
    expect(confirm.mock.calls[0]![0]).toMatch(/can't be undone/)
    confirm.mockReturnValueOnce(true)
    fireEvent.click(within(rafi).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocked.eraseSubscriber).toHaveBeenCalledWith('s1'))
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted \(also from Resend\)/)
    confirm.mockRestore()
  })

  it('CSV download', async () => {
    mocked.exportSubscribersCsv.mockResolvedValue(ok(null))
    render(<NewsletterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV (confirmed)' }))
    expect(mocked.exportSubscribersCsv).toHaveBeenCalled()
  })
})
