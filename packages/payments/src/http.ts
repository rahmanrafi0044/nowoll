// The tiny HTTP layer the SSLCommerz adapter uses. Swappable, so tests can
// replace SSLCommerz with a fake that records requests and replays answers.

export interface HttpResponse {
  status: number
  text: () => Promise<string>
}
export type HttpClient = (
  url: string,
  init: { method: 'GET' | 'POST'; body?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>

export const DEFAULT_TIMEOUT_MS = 10_000

/** Real HTTP via fetch, giving up after 10 seconds (a hanging gateway must not hang checkout). */
export const fetchClient: HttpClient = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
