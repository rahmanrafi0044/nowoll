import type {
  BreadcrumbItem,
  CategorySummary,
  Paginated,
  ProductCardView,
  ProductFacetsView,
} from '@nowoll/types'
import Link from 'next/link'
import { ProductCard } from '@/components/product-card'
import { apiGet } from '@/lib/api'
import { getSettings } from '@/lib/settings'
import { formatBdt } from '@/lib/format'
import {
  hasActiveFilters,
  type ListingParams,
  listingHref,
  SORTS,
  type SortValue,
  toApiQuery,
} from '@/lib/listing'
import { FilterForm } from './filter-form'
import { MobileFilters } from './mobile-filters'
import { Pagination } from './pagination'
import { SortSelect } from './sort-select'

const EMPTY_FACETS: ProductFacetsView = { sizes: [], colors: [], price: null }

// The product listing used by /shop and /shop/[category]: heading, filters,
// sort, product grid with quick view, and pagination.
export async function ListingPage({
  basePath,
  title,
  description,
  breadcrumb = [],
  subcategories = [],
  category,
  params,
  search,
}: {
  basePath: string
  title: string
  description?: string | null
  breadcrumb?: BreadcrumbItem[]
  subcategories?: CategorySummary[]
  category?: string
  params: ListingParams
  search?: boolean
}) {
  const facetQuery = new URLSearchParams({
    ...(category && { category }),
    ...(params.q && { q: params.q }),
  }).toString()
  const settings = await getSettings()
  const defaults = { pageSize: settings.shop_page_size, sort: settings.shop_default_sort }
  const [result, facets] = await Promise.all([
    apiGet<Paginated<ProductCardView>>(`/products?${toApiQuery(params, category, defaults)}`),
    apiGet<ProductFacetsView>(`/products/facets${facetQuery ? `?${facetQuery}` : ''}`),
  ])
  const products = result?.items ?? []
  const total = result?.total ?? 0
  const sort = params.sort ?? (params.q ? 'relevance' : settings.shop_default_sort)
  const sortChoices: { value: SortValue; label: string }[] = [
    ...(params.q ? [{ value: 'relevance' as const, label: 'Best match' }] : []),
    ...SORTS,
  ]
  const sortOptions = sortChoices.map((o) => ({
    ...o,
    href: listingHref(basePath, params, { sort: o.value }),
  }))

  const chips = [
    params.size && {
      label: `Size: ${params.size}`,
      href: listingHref(basePath, params, { size: undefined }),
    },
    params.color && {
      label: `Color: ${params.color}`,
      href: listingHref(basePath, params, { color: undefined }),
    },
    params.minPrice !== undefined && {
      label: `From ${formatBdt(params.minPrice)}`,
      href: listingHref(basePath, params, { minPrice: undefined }),
    },
    params.maxPrice !== undefined && {
      label: `Up to ${formatBdt(params.maxPrice)}`,
      href: listingHref(basePath, params, { maxPrice: undefined }),
    },
    params.inStock && {
      label: 'In stock',
      href: listingHref(basePath, params, { inStock: undefined }),
    },
  ].filter((c): c is { label: string; href: string } => Boolean(c))

  const filterForm = (
    <FilterForm basePath={basePath} params={params} facets={facets ?? EMPTY_FACETS} />
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:pb-8">
      {breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:underline">
                Home
              </Link>
            </li>
            {breadcrumb.map((b, i) => (
              <li key={b.id} className="flex items-center gap-1">
                <span aria-hidden="true">/</span>
                {i === breadcrumb.length - 1 ? (
                  <span aria-current="page" className="text-foreground">
                    {b.name}
                  </span>
                ) : (
                  <Link href={`/shop/${b.slug}`} className="hover:underline">
                    {b.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </header>

      {search && (
        <form method="get" action={basePath} role="search" className="mt-6 flex max-w-md gap-2">
          <label className="flex-1">
            <span className="sr-only">Search products</span>
            <input
              type="search"
              name="q"
              defaultValue={params.q}
              placeholder="Search shirts, panjabi, kurti…"
              className="h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Search
          </button>
        </form>
      )}

      {subcategories.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Subcategories">
          {subcategories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/shop/${c.slug}`}
                className="inline-flex h-10 items-center rounded-full border border-border-strong px-4 text-sm hover:bg-surface-muted"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[14rem_1fr]">
        <aside aria-label="Filters" className="hidden md:block">
          {filterForm}
        </aside>

        <section aria-labelledby="products-heading">
          {/* For screen-reader users, who move through a page by its headings: the
              product cards are <h3>s, so the list needs an <h2> above them (step 52). */}
          <h2 id="products-heading" className="sr-only">
            Products
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {total} {total === 1 ? 'product' : 'products'}
            </p>
            {/* flex-wrap: on a 320 px phone (or 200% zoom) "Sort by" moves under
                "Filters" instead of making the page scroll sideways (WCAG 1.4.10). */}
            <div className="flex flex-wrap items-center gap-3">
              <MobileFilters activeCount={chips.length}>{filterForm}</MobileFilters>
              <SortSelect options={sortOptions} current={sort} />
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.label}>
                  <Link
                    href={chip.href}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-muted px-3 text-sm hover:bg-border"
                  >
                    {chip.label}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">(remove filter)</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {products.length === 0 ? (
            <div className="mt-12 flex flex-col items-center gap-3 text-center">
              <p className="text-lg font-medium">No products match</p>
              <p className="text-muted-foreground">
                {hasActiveFilters(params) || params.q
                  ? 'Try removing a filter or searching for something else.'
                  : 'Check back soon — new things arrive often.'}
              </p>
              {(hasActiveFilters(params) || params.q) && (
                <Link href={basePath} className="text-sm font-medium underline underline-offset-4">
                  Clear all filters
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3">
              {products.map((product, i) => (
                <li key={product.id}>
                  <ProductCard product={product} priority={i < 2} quickView />
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={params.page}
            totalPages={result?.totalPages ?? 0}
            hrefFor={(page) => listingHref(basePath, params, { page })}
          />
        </section>
      </div>
    </div>
  )
}
