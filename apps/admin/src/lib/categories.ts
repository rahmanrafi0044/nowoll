import type { CategoryNode } from '@/lib/products-api'

/** The category tree as one list for a <select>: "Men", "Men › Shirts", … */
export function flattenCategories(
  nodes: CategoryNode[],
  prefix = '',
): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${prefix}${n.name}${n.isActive === false ? ' (hidden)' : ''}` },
    ...flattenCategories(n.children ?? [], `${prefix}${n.name} › `),
  ])
}
