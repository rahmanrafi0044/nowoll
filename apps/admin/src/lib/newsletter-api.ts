import type {
  AdminSubscribersPage,
  NewsletterSyncStatus,
  SubscriberStatusView,
} from '@nowoll/types'
import { call, download } from '@/lib/api'

// Admin → Newsletter (step 42) — apps/api/src/subscribers.

export interface SubscriberFilters {
  status?: SubscriberStatusView
  q?: string
  page: number
}

export function fetchSubscribers(f: SubscriberFilters) {
  const p = new URLSearchParams({ page: String(f.page) })
  if (f.status) p.set('status', f.status)
  if (f.q) p.set('q', f.q)
  return call<AdminSubscribersPage>('GET', `/admin/subscribers?${p}`)
}

export const fetchNewsletterSync = () =>
  call<NewsletterSyncStatus>('GET', '/admin/subscribers/resend')

export const syncEveryone = () =>
  call<{ queued: true }>('POST', '/admin/subscribers/resend/sync-all')

export const unsubscribeSubscriber = (id: string) =>
  call<{ status: 'UNSUBSCRIBED' }>('PATCH', `/admin/subscribers/${id}/unsubscribe`)

/** Erase completely (a data deletion request) — also from Resend. */
export const eraseSubscriber = (id: string) =>
  call<{ deleted: true }>('DELETE', `/admin/subscribers/${id}`)

export const exportSubscribersCsv = () =>
  download('/admin/subscribers/export.csv', 'nowoll-newsletter-subscribers.csv')
