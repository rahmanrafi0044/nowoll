import type { MarketingStatusView, MetaEventLogView, TestEventResultView } from '@nowoll/types'
import { call } from '@/lib/api'

// Admin → Marketing (step 39b) — apps/api/src/marketing.

export const fetchMarketingStatus = () =>
  call<MarketingStatusView>('GET', '/admin/marketing/status')

export const fetchMetaEvents = () => call<MetaEventLogView[]>('GET', '/admin/marketing/events')

/** One test Purchase with Meta's test code — shows up in Events Manager → Test events. */
export const sendTestEvent = (testEventCode: string) =>
  call<TestEventResultView>('POST', '/admin/marketing/test-event', { testEventCode })
