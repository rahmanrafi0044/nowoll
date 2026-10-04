// The envelope EVERY API response is wrapped in (CLAUDE.md §8):
//   success → { success: true,  data: ..., message?: ... }
//   failure → { success: false, error: 'NOT_FOUND', message: 'Product not found' }
// The frontend can always check `success` first, whatever the endpoint.
//
// TODO(phase-1 step 6): move to packages/types so storefront/admin share it.
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
