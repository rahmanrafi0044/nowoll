import type { ProductFacetsView } from '@nowoll/types'
import Link from 'next/link'
import { formatBdt } from '@/lib/format'
import type { ListingParams } from '@/lib/listing'

// The filters (design refresh 38f: in a drawer, with how many products each
// choice has). A plain HTML GET form: "Show products" reloads the page with the
// choices in the URL (?size=M&fabric=Lawn) — it works before JavaScript loads,
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
  const sizeCount = (s: string) => facets.counts?.sizes[s]
  const colorCount = (c: string) => facets.counts?.colors[c]
  const fabrics = facets.fabrics ?? []

  return (
    <form method="get" action={basePath} className="flex h-full flex-col">
      {/* Keep the search and sort when applying filters */}
      {params.q && <input type="hidden" name="q" value={params.q} />}
      {params.sort && <input type="hidden" name="sort" value={params.sort} />}

      <div className="flex flex-1 flex-col divide-y divide-border overflow-y-auto">
        {facets.sizes.length > 0 && (
          <Group legend="Size">
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
                  <span className="flex h-10 min-w-12 items-center justify-center gap-1.5 border border-border-strong px-3 text-sm peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                    {size || 'Any'}
                    {size && sizeCount(size) !== undefined && (
                      <span className="text-xs opacity-70"> ({sizeCount(size)})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </Group>
        )}

        {facets.colors.length > 0 && (
          <Group legend="Colour">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
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
                    className="size-4 accent-foreground"
                  />
                  {c.color && (
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-full border border-border-strong"
                      style={{ backgroundColor: c.colorHex ?? 'transparent' }}
                    />
                  )}
                  {c.color || 'Any colour'}
                  {c.color && colorCount(c.color) !== undefined && (
                    <span className="text-muted-foreground"> ({colorCount(c.color)})</span>
                  )}
                </label>
              ))}
            </div>
          </Group>
        )}

        {fabrics.length > 0 && (
          <Group legend="Fabric">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {[{ fabric: '', count: 0 }, ...fabrics].map((f) => (
                <label
                  key={f.fabric || 'any'}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="fabric"
                    value={f.fabric}
                    defaultChecked={(params.fabric ?? '').toLowerCase() === f.fabric.toLowerCase()}
                    className="size-4 accent-foreground"
                  />
                  {f.fabric || 'Any fabric'}
                  {f.fabric && <span className="text-muted-foreground"> ({f.count})</span>}
                </label>
              ))}
            </div>
          </Group>
        )}

        {facets.price && (
          <Group legend="Price (৳)">
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
                  className="h-10 w-full border border-border-strong bg-surface-raised px-2 text-base"
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
                  className="h-10 w-full border border-border-strong bg-surface-raised px-2 text-base"
                />
              </label>
            </div>
          </Group>
        )}

        <div className="py-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="inStock"
              value="1"
              defaultChecked={params.inStock}
              className="size-4 accent-foreground"
            />
            In stock only
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-border pt-4">
        <button
          type="submit"
          className="h-12 flex-1 bg-foreground px-4 text-sm font-medium tracking-[0.08em] text-surface uppercase hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Show products
        </button>
        <Link href={basePath} className="text-sm underline underline-offset-4">
          Clear all
        </Link>
      </div>
    </form>
  )
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    // float + clear: a <legend> otherwise sits ON the fieldset's top edge (browser
    // default), squeezed against the line above; floated, it spaces like a heading.
    <fieldset className="py-5">
      <legend className="float-left mb-3 w-full text-xs font-medium tracking-[0.12em] uppercase">
        {legend}
      </legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  )
}
