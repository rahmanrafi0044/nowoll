import { call } from '@/lib/api'

// Admin → Content → Redirects (step 43c) — apps/api/src/redirects.

export interface AdminRedirect {
  id: string
  fromPath: string
  toPath: string
  permanent: boolean
  isActive: boolean
  source: 'MANUAL' | 'AUTO'
  createdAt: string
  updatedAt: string
}

export interface RedirectFields {
  fromPath: string
  toPath: string
  permanent: boolean
  isActive: boolean
}

export const fetchRedirects = (q?: string) =>
  call<AdminRedirect[]>('GET', `/admin/redirects${q ? `?q=${encodeURIComponent(q)}` : ''}`)

export const createRedirect = (body: RedirectFields) =>
  call<AdminRedirect>('POST', '/admin/redirects', body)

export const updateRedirect = (id: string, body: RedirectFields) =>
  call<AdminRedirect>('PATCH', `/admin/redirects/${id}`, body)

export const deleteRedirect = (id: string) =>
  call<{ deleted: true }>('DELETE', `/admin/redirects/${id}`)
