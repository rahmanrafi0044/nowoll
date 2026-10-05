import type { ProductFacetsView } from '@nowoll/types'
import Link from 'next/link'
import { formatBdt } from '@/lib/format'
import type { ListingParams } from '@/lib/listing'

// The filter panel. A plain HTML GET form: "Apply" reloads the page with the
// choices in the URL (?size=M&color=Blue). It works before JavaScript loads,
// and every filtered view has a shareable, bookmarkable link.
export function FilterForm({
  basePath,
  params,
  facets,
}: {
  basePath: string
  params: ListingParams
  facets: ProductFacetsView
}) {
  return (
    <form method="get" action={basePath} className="flex flex-col gap-6">
      {/* Keep the search and sort when applying filters */}
      {params.q && <input type="hidden" name="q" value={params.q} />}
      {params.sort && <input type="hidden" name="sort" value={params.sort} />}

      {facets.sizes.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Size</legend>
          <div className="flex flex-wrap gap-2">
            {['', ...facets.sizes].map((size) => (
              <label key={size || 'any'} className="cursor-pointer">
                <input
                  type="radio"
                  name="size"
                  value={size}
                  defaultChecked={(params.size ?? '') === size}
                  className="peer sr-only"
                />
                <span className="flex h-10 min-w-11 items-center justify-center rounded-control border border-border-strong px-3 text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                  {size || 'Any'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {facets.colors.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Color</legend>
          <div className="flex flex-col gap-2">
            {[{ color: '', colorHex: null }, ...facets.colors].map((c) => (
              <label
                key={c.color || 'any'}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="color"
                  value={c.color}
                  defaultChecked={(params.color ?? '') === c.color}
                  className="size-4 accent-brand"
                />
                {c.color && (
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full border border-border-strong"
                    style={{ backgroundColor: c.colorHex ?? 'transparent' }}
                  />
                )}
                {c.color || 'Any color'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {facets.price && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Price (৳)</legend>
          <div className="flex items-center gap-2">
            <label className="flex-1 text-sm">
              <span className="sr-only">Minimum price</span>
              <input
                type="number"
                name="minPrice"
                min={0}
                inputMode="numeric"
                placeholder={`Min ${formatBdt(facets.price.min)}`}
                defaultValue={params.minPrice}
                className="h-10 w-full rounded-control border border-border-strong bg-surface px-2 text-base"
              />
            </label>
            <span aria-hidden="true">–</span>
            <label className="flex-1 text-sm">
              <span className="sr-only">Maximum price</span>
              <input
                type="number"
                name="maxPrice"
                min={0}
                inputMode="numeric"
                placeholder={`Max ${formatBdt(facets.price.max)}`}
                defaultValue={params.maxPrice}
                className="h-10 w-full rounded-control border border-border-strong bg-surface px-2 text-base"
              />
            </label>
          </div>
        </fieldset>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="inStock"
          value="1"
          defaultChecked={params.inStock}
          className="size-4 accent-brand"
        />
        In stock only
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-11 flex-1 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Apply filters
        </button>
        <Link href={basePath} className="text-sm underline underline-offset-4">
          Clear all
        </Link>
      </div>
    </form>
  )
}
