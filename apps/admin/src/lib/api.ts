import { publicEnv } from '@/lib/env'

// The API's answer shape (CLAUDE.md §8).
type ApiResult<T> =
  { success: true; data: T } | { success: false; error?: string; message?: string }

export type ApiCallResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error?: string; message: string }

/**
 * One call to the API from the browser. Never throws: failures come back as { ok: false }.
 * credentials: 'include' sends the admin session cookies (HttpOnly — this code
 * never sees them; only the API can read and verify them).
 */
export async function call<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiCallResult<T>> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, {
      method,
      credentials: 'include',
      ...((method === 'POST' || method === 'PATCH') && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    })
    const json = (await res.json()) as ApiResult<T>
    if (json.success) return { ok: true, data: json.data }
    return {
      ok: false,
      status: res.status,
      error: json.error,
      message: json.message ?? 'Something went wrong. Please try again.',
    }
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not connect. Check your internet and try again.',
    }
  }
}
