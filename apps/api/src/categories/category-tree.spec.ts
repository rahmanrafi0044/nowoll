import {
  ancestorsOf,
  buildTree,
  type CategoryRow,
  visibleCategories,
  wouldCreateCycle,
} from './category-tree.js'

const row = (
  id: string,
  parentId: string | null,
  extra: Partial<CategoryRow> = {},
): CategoryRow => ({
  id,
  parentId,
  name: id,
  sortOrder: 0,
  isActive: true,
  deletedAt: null,
  ...extra,
})

describe('visibleCategories', () => {
  it('keeps active categories whose ancestors are all active', () => {
    const rows = [row('men', null), row('shirts', 'men'), row('formal', 'shirts')]
    expect(visibleCategories(rows).map((r) => r.id)).toEqual(['men', 'shirts', 'formal'])
  })

  it('hides a whole branch when its top category is inactive', () => {
    const rows = [
      row('men', null, { isActive: false }),
      row('shirts', 'men'),
      row('formal', 'shirts'),
    ]
    expect(visibleCategories(rows)).toEqual([])
  })

  it('hides deleted categories and anything whose parent is missing', () => {
    const rows = [row('a', null, { deletedAt: new Date() }), row('b', 'a'), row('orphan', 'gone')]
    expect(visibleCategories(rows)).toEqual([])
  })

  it('never shows categories caught in a parent loop (bad data)', () => {
    expect(visibleCategories([row('x', 'y'), row('y', 'x')])).toEqual([])
  })
})

describe('buildTree', () => {
  it('nests children and sorts by sortOrder, then name', () => {
    const rows = [
      row('women', null, { sortOrder: 2 }),
      row('men', null, { sortOrder: 1 }),
      row('tees', 'men', { name: 'Tees' }),
      row('jeans', 'men', { name: 'Jeans' }),
    ]
    const tree = buildTree(rows)
    expect(tree.map((n) => n.id)).toEqual(['men', 'women'])
    expect(tree[0]?.children.map((n) => n.id)).toEqual(['jeans', 'tees'])
  })
})

describe('ancestorsOf', () => {
  it('returns the breadcrumb from top level down to the direct parent', () => {
    const rows = [row('men', null), row('shirts', 'men'), row('formal', 'shirts')]
    expect(ancestorsOf('formal', rows).map((r) => r.id)).toEqual(['men', 'shirts'])
    expect(ancestorsOf('men', rows)).toEqual([])
  })
})

describe('wouldCreateCycle', () => {
  const rows = [row('men', null), row('shirts', 'men'), row('formal', 'shirts'), row('women', null)]

  it('blocks making a category its own parent', () => {
    expect(wouldCreateCycle('men', 'men', rows)).toBe(true)
  })

  it('blocks moving a category inside its own descendant', () => {
    expect(wouldCreateCycle('men', 'formal', rows)).toBe(true)
  })

  it('allows normal moves', () => {
    expect(wouldCreateCycle('formal', 'women', rows)).toBe(false)
    expect(wouldCreateCycle('shirts', 'women', rows)).toBe(false)
  })
})
