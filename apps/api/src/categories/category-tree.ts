// ============================================================================
// Pure functions for working with the category hierarchy — no database here,
// so they're fast and simple to test. The service loads rows, these shape them.
//
// Why load ALL categories and build the tree in memory instead of a recursive
// SQL query? A clothing store has tens of categories, not millions. One simple
// query + a few lines of code is easier to understand and change.
// ============================================================================

export interface CategoryRow {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
  isActive: boolean
  deletedAt: Date | null
}

export type TreeNode<T> = T & { children: TreeNode<T>[] }

/** Display order: sortOrder first (admin-controlled), then alphabetical. */
export function compareCategories(a: CategoryRow, b: CategoryRow): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

/**
 * Categories a CUSTOMER may see: active, not deleted, and every ancestor is
 * visible too. Hiding "Men" therefore also hides "Men → Shirts".
 */
export function visibleCategories<T extends CategoryRow>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const memo = new Map<string, boolean>()

  const isVisible = (row: T, seen: Set<string>): boolean => {
    const cached = memo.get(row.id)
    if (cached !== undefined) return cached
    if (seen.has(row.id)) return false // defensive: a loop in the data is never visible
    seen.add(row.id)

    let visible = row.isActive && row.deletedAt === null
    if (visible && row.parentId !== null) {
      const parent = byId.get(row.parentId)
      visible = parent !== undefined && isVisible(parent, seen)
    }
    memo.set(row.id, visible)
    return visible
  }

  return rows.filter((row) => isVisible(row, new Set()))
}

/** Nests a flat list into a tree. Rows whose parent isn't in the list are dropped. */
export function buildTree<T extends CategoryRow>(rows: T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>(rows.map((r) => [r.id, { ...r, children: [] }]))
  const roots: TreeNode<T>[] = []

  for (const node of nodes.values()) {
    if (node.parentId === null) roots.push(node)
    else nodes.get(node.parentId)?.children.push(node)
  }

  const sortDeep = (list: TreeNode<T>[]) => {
    list.sort(compareCategories)
    for (const node of list) sortDeep(node.children)
  }
  sortDeep(roots)
  return roots
}

/** Ancestors from the top level down to the direct parent — i.e. the breadcrumb. */
export function ancestorsOf<T extends CategoryRow>(id: string, rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const chain: T[] = []
  const seen = new Set<string>([id])
  let parentId = byId.get(id)?.parentId ?? null

  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    chain.unshift(parent)
    seen.add(parentId)
    parentId = parent.parentId
  }
  return chain
}

/**
 * Would making `newParentId` the parent of `categoryId` create a loop?
 * True if newParentId IS the category, or is one of its descendants
 * (e.g. moving "Men" inside "Men → Shirts").
 */
export function wouldCreateCycle(
  categoryId: string,
  newParentId: string,
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
): boolean {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))
  const seen = new Set<string>()
  let current: string | null = newParentId

  while (current !== null && !seen.has(current)) {
    if (current === categoryId) return true
    seen.add(current)
    current = parentOf.get(current) ?? null
  }
  return false
}
