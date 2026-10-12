import type { ConfigService } from '@nestjs/config'
import {
  type FetchLike,
  type MetaAnswer,
  type MetaServerEvent,
  sendToMeta,
} from '@nowoll/analytics/server'
import type { EnvironmentVariables } from '../config/env.validation.js'

// ADAPTER PATTERN (like PAYMENT_GATEWAY): the marketing service asks for
// "the Meta sender" by this name. The real one talks to graph.facebook.com
// with the token from the server .env; tests hand in a fake, so no test ever
// reaches Meta (test/utils/fake-meta-sender.ts).
export const META_SENDER = 'META_SENDER'

export interface MetaSender {
  /** Is META_CAPI_ACCESS_TOKEN set on the server? (The token itself never leaves this class.) */
  readonly tokenSet: boolean
  send(pixelId: string, events: MetaServerEvent[], testEventCode?: string): Promise<MetaAnswer>
}

export class GraphMetaSender implements MetaSender {
  constructor(
    private readonly accessToken: string | undefined,
    private readonly fetchFn: FetchLike = fetch as unknown as FetchLike,
  ) {}

  get tokenSet() {
    return !!this.accessToken
  }

  async send(pixelId: string, events: MetaServerEvent[], testEventCode?: string) {
    if (!this.accessToken)
      return {
        ok: false as const,
        retry: false,
        tokenProblem: true,
        message: 'META_CAPI_ACCESS_TOKEN is not set on the server',
        fbtraceId: null,
      }
    return sendToMeta({
      pixelId,
      accessToken: this.accessToken,
      events,
      testEventCode,
      fetch: this.fetchFn,
    })
  }
}

export const metaSenderFromConfig = (config: ConfigService<EnvironmentVariables, true>) =>
  new GraphMetaSender(config.get('META_CAPI_ACCESS_TOKEN', { infer: true }))
