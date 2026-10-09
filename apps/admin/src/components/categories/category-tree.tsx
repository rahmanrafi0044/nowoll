'use client'

import type { AdminCategoryNode } from '@nowoll/types'
import { Badge, Button } from '@nowoll/ui'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { move } from '@/components/content/layout-editor'
import { fetchCategoryTree, reorderCategories } from '@/lib/categories-api'

// ============================================================================
// Admin → Categories (step 36b): the tree as the shop's menu shows it.
// ↑ / ↓ move a category among its SISTERS (same parent) and save at once —
// the shop's menu and homepage grid follow this order.
// A category is seen by customers only when it AND all its parents are on.
// ============================================================================

const linkButton = 'inline-flex h-11 items-center rounded-control px-5 text-sm font-medium'

export function CategoryTree() {
  const { state, retry, refresh } = useLoad(fetchCategoryTree)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function reorder(
    parentId: string | null,
    sisters: AdminCategoryNode[],
    i: number,
    by: -1 | 1,
  ) {
    setBusy(true)
    setProblem(null)
    const r = await reorderCategories(
      parentId,
      move(sisters, i, by).map((c) => c.id),
    )
    setBusy(false)
    if (!r.ok) setProblem(r.message)
    refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/categories/archived"
            className={`${linkButton} border border-border-strong bg-surface hover:bg-surface-muted`}
          >
            Archived
          </Link>
          <Link
            href="/admin/categories/new"
            className={`${linkButton} bg-brand text-brand-foreground hover:bg-brand-hover`}
          >
            New category
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        The order here is the order in the shop’s menu and homepage. A hidden category also hides
        its subcategories and their products.
      </p>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <Panel title="All categories" state={state} retry={retry}>
        {(tree) =>
          tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categories yet. Create one, e.g. “Men”, then “Shirts” inside it.
            </p>
          ) : (
            <Level
              nodes={tree}
              parentId={null}
              parentHidden={false}
              depth={0}
              busy={busy}
              onMove={reorder}
            />
          )
        }
      </Panel>
    </div>
  )
}

function Level({
  nodes,
  parentId,
  parentHidden,
  depth,
  busy,
  onMove,
}: {
  nodes: AdminCategoryNode[]
  parentId: string | null
  parentHidden: boolean
  depth: number
  busy: boolean
  onMove: (parentId: string | null, sisters: AdminCategoryNode[], i: number, by: -1 | 1) => void
}) {
  return (
    <ul
      className={depth === 0 ? 'flex flex-col' : 'flex flex-col border-l border-border pl-4 ml-5'}
    >
      {nodes.map((c, i) => {
        const seen = c.isActive && !parentHidden
        return (
          <li key={c.id}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border py-2.5">
              <span className="relative size-10 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                {c.imageUrl && (
                  <Image src={c.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                )}
              </span>
              <span className="mr-auto min-w-0">
                <Link
                  href={`/admin/categories/${c.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {c.name}
                </Link>
                <span className="block font-mono text-xs text-muted-foreground">
                  /shop/{c.slug}
                </span>
              </span>
              <Link
                href={`/admin/products?categoryId=${c.id}`}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {c.productCount} product{c.productCount === 1 ? '' : 's'}
              </Link>
              {seen ? (
                <Badge variant="success">On</Badge>
              ) : c.isActive ? (
                <Badge variant="warning">Hidden by parent</Badge>
              ) : (
                <Badge variant="neutral">Hidden</Badge>
              )}
              <span className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || i === 0}
                  aria-label={`Move ${c.name} up`}
                  onClick={() => onMove(parentId, nodes, i, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || i === nodes.length - 1}
                  aria-label={`Move ${c.name} down`}
                  onClick={() => onMove(parentId, nodes, i, 1)}
                >
                  ↓
                </Button>
              </span>
            </div>
            {c.children.length > 0 && (
              <Level
                nodes={c.children}
                parentId={c.id}
                parentHidden={!seen}
                depth={depth + 1}
                busy={busy}
                onMove={onMove}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
