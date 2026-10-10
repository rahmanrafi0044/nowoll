import { call } from '@/lib/api'

// Storefront content in the admin panel (step 36) — apps/api/src/content.

export type ContentKey =
  | 'announcement_bar'
  | 'homepage_hero'
  | 'homepage_layout'
  | 'main_menu' // step 38b
  | 'footer' // step 38b

export interface AdminContentBlock {
  key: ContentKey
  /** What is saved (null = never saved: the shop uses its default). */
  data: unknown
  isActive: boolean
  /** false = the saved data no longer fits its format (hidden on the shop). */
  valid: boolean
  updatedAt: string | null
}

export const fetchContentBlocks = () => call<AdminContentBlock[]>('GET', '/admin/content-blocks')

export const fetchContentBlock = (key: ContentKey) =>
  call<AdminContentBlock>('GET', `/admin/content-blocks/${key}`)

/** The API checks `data` against the block's format; problems come back in `details`. */
export const saveContentBlock = (key: ContentKey, data: unknown, isActive: boolean) =>
  call<AdminContentBlock>('PUT', `/admin/content-blocks/${key}`, { data, isActive })

/** Empties a block and switches it off (the shop goes back to its default — for the announcement: no bar). */
export const clearContentBlock = (key: ContentKey) =>
  call<AdminContentBlock>('DELETE', `/admin/content-blocks/${key}`)

/** A homepage picture (hero, banner) → its https address. */
export function uploadContentImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return call<{ url: string }>('POST', '/admin/content/images', form)
}
