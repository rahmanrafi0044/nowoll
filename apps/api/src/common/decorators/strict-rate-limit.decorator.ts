import { Throttle } from '@nestjs/throttler'
import { STRICT_RATE_LIMIT } from '../../config/rate-limit.js'

// Put @StrictRateLimit() on the auth and payment controllers (Phase 3/4) to
// drop them from 100 req/min to 5 req/min per IP.
// NOTE for Phase 3: the SSLCommerz IPN endpoint is called by SSLCommerz's own
// servers, not customers — it should NOT get this limit, or legitimate payment
// notifications could be rejected.
export const StrictRateLimit = () => Throttle({ default: STRICT_RATE_LIMIT })
