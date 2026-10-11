import type { MetaAnswer, MetaServerEvent } from '@nowoll/analytics/server'
import type { MetaSender } from '../../src/marketing/meta-sender.js'

/**
 * Stands in for Meta in every API test (step 39b) — nothing ever reaches
 * graph.facebook.com. Records what would have been sent; `answer` and
 * `tokenSet` can be changed per test.
 */
export class FakeMetaSender implements MetaSender {
  tokenSet = true
  sent: { pixelId: string; events: MetaServerEvent[]; testEventCode?: string }[] = []
  answer: MetaAnswer = { ok: true, eventsReceived: 1, messages: [], fbtraceId: 'FAKE-TRACE' }

  async send(pixelId: string, events: MetaServerEvent[], testEventCode?: string) {
    this.sent.push({ pixelId, events, testEventCode })
    return this.answer
  }
}
