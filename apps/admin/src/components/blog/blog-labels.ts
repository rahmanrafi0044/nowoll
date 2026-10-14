import type { AdminBlogRow } from '@nowoll/types'
import type { BadgeVariant } from '@nowoll/ui'

/** A post's state for people: Draft / Scheduled / Published / Archived. */
export function postState(p: Pick<AdminBlogRow, 'status' | 'scheduled'>): {
  label: string
  variant: BadgeVariant
} {
  if (p.status === 'ARCHIVED') return { label: 'Archived', variant: 'warning' }
  if (p.status === 'DRAFT') return { label: 'Draft', variant: 'neutral' }
  return p.scheduled
    ? { label: 'Scheduled', variant: 'info' }
    : { label: 'Published', variant: 'success' }
}
