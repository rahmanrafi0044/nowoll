import { SLUG_MAX_LENGTH, slugify } from '@nowoll/validation'

/**
 * Picks the first free slug: "shirts", then "shirts-2", "shirts-3"…
 * Pure function — the caller loads which slugs are already taken
 * (see slugPrefixOf for the query prefix). Shared by categories and products.
 */
export function pickUniqueSlug(name: string, taken: Set<string>, fallback: string): string {
  const base = slugify(name) || fallback
  if (!taken.has(base)) return base

  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

/** The prefix to search for existing slugs that could collide with `name`'s slug. */
export function slugPrefixOf(name: string, fallback: string): string {
  return (slugify(name) || fallback).slice(0, SLUG_MAX_LENGTH - 6)
}
