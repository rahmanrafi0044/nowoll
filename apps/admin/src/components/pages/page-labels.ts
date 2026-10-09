import type { BadgeVariant } from '@nowoll/ui'
import type { PageStatus } from '@nowoll/types'

export const PAGE_STATUS: Record<PageStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  ARCHIVED: { label: 'Archived', variant: 'warning' },
}
