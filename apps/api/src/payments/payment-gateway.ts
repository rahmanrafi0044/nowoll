import type { ConfigService } from '@nestjs/config'
import { isSslCommerzConfigured, SslCommerzAdapter } from '@nowoll/payments'
import type { EnvironmentVariables } from '../config/env.validation.js'

// DEPENDENCY INJECTION TOKENS: the payment service asks Nest for "the online
// payment gateway" by this name instead of creating SSLCommerz itself. Tests
// hand it a fake gateway instead (test/utils/fake-payment-gateway.ts), so no
// test ever talks to SSLCommerz or moves money.
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY'
export const PAYMENTS_CONFIG = 'PAYMENTS_CONFIG'

export interface PaymentsConfig {
  /** The API's public address, e.g. https://api.nowoll.com — SSLCommerz calls us back here. */
  apiPublicUrl: string
  /** The storefront's address — customers are sent back here after paying. */
  siteUrl: string
  /** False when the SSLCommerz credentials are missing (development): "Pay online" is refused. */
  onlineEnabled: boolean
}

type Config = ConfigService<EnvironmentVariables, true>

export function sslCommerzFromConfig(config: Config): SslCommerzAdapter {
  return new SslCommerzAdapter({
    storeId: config.get('SSLCOMMERZ_STORE_ID', { infer: true }),
    storePassword: config.get('SSLCOMMERZ_STORE_PASSWORD', { infer: true }),
    isLive: config.get('SSLCOMMERZ_IS_LIVE', { infer: true }) === 'true',
  })
}

export function paymentsConfigFrom(config: Config): PaymentsConfig {
  const trim = (url: string) => url.replace(/\/+$/, '')
  return {
    apiPublicUrl: trim(config.get('API_PUBLIC_URL', { infer: true })),
    siteUrl: trim(config.get('NEXT_PUBLIC_SITE_URL', { infer: true })),
    onlineEnabled: isSslCommerzConfigured({
      storeId: config.get('SSLCOMMERZ_STORE_ID', { infer: true }),
      storePassword: config.get('SSLCOMMERZ_STORE_PASSWORD', { infer: true }),
    }),
  }
}
