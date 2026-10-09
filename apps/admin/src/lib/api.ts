import type { ApiResult } from '@nowoll/types'
import { publicEnv } from '@/lib/env'

export type ApiCallResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      status: number
      error?: string
      message: string
      /** One line per problem, when the API lists them (e.g. CSV import, with row numbers). */
      details?: string[]
    }

const OFFLINE = {
  ok: false,
  status: 0,
  message: 'Could not connect. Check your internet and try again.',
} as const

/**
 * One call to the API from the browser. Never throws: failures come back as { ok: false }.
 * credentials: 'include' sends the admin session cookies (HttpOnly — this code
 * never sees them; only the API can read and verify them).
 */
export async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiCallResult<T>> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, {
      method,
      credentials: 'include',
      ...(body instanceof FormData
        ? { body } // the browser sets the multipart Content-Type (with its boundary) itself
        : (method === 'POST' || method === 'PUT' || method === 'PATCH') && {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body ?? {}),
          }),
    })
    return toResult<T>(res, (await res.json()) as ApiResult<T>)
  } catch {
    return OFFLINE
  }
}

/**
 * Downloads a file the API sends (e.g. the products CSV) and hands it to the
 * browser's "save" — the request needs the admin cookies, so a plain link won't do.
 */
export async function download(path: string, fallbackName: string): Promise<ApiCallResult<null>> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, { credentials: 'include' })
    if (!res.ok) return toResult<null>(res, (await res.json()) as ApiResult<null>)
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1]
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name ?? fallbackName
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true, data: null }
  } catch {
    return OFFLINE
  }
}

function toResult<T>(res: Response, json: ApiResult<T>): ApiCallResult<T> {
  if (json.success) return { ok: true, data: json.data }
  return {
    ok: false,
    status: res.status,
    error: json.error,
    message: json.message ?? 'Something went wrong. Please try again.',
    ...(json.details && { details: json.details }),
  }
}
