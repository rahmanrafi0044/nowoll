'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, type ReactNode } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchCategories, fetchProduct } from '@/lib/products-api'
import { DetailsForm } from './details-form'
import { ImagesSection } from './images-section'
import { StatusCard } from './status-card'
import { VariantsSection } from './variants-section'

/**
 * The edit page (step 30b): one product loaded once, four sections. Every
 * change is saved through the normal API (with all its rules), then the
 * product is loaded again — the page always shows what is really saved.
 */
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter()
  const load = useCallback(() => fetchProduct(id), [id])
  const { state, retry, refresh } = useLoad(load)
  const categories = useLoad(fetchCategories)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Products
      </Link>
      <Panel title="Product" state={state} retry={retry}>
        {(product) => {
          const readOnly = product.status === 'ARCHIVED'
          return (
            <div className="flex flex-col gap-6">
              <h1 className="text-2xl font-semibold">{product.name}</h1>
              <div className="grid gap-6 lg:grid-cols-3">
                <Section title="Details" className="lg:col-span-2">
                  <DetailsForm
                    product={product}
                    categories={categories.state.status === 'ok' ? categories.state.data : []}
                    readOnly={readOnly}
                    onSaved={refresh}
                  />
                </Section>
                <Section title="Status">
                  <StatusCard
                    product={product}
                    onChanged={refresh}
                    onArchived={() => router.push('/admin/products')}
                  />
                </Section>
              </div>
              <Section title="Sizes and colours">
                <VariantsSection product={product} readOnly={readOnly} onChanged={refresh} />
              </Section>
              <Section title="Photos">
                <ImagesSection product={product} readOnly={readOnly} onChanged={refresh} />
              </Section>
            </div>
          )
        }}
      </Panel>
    </div>
  )
}

function Section({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-lg border border-border p-5 ${className ?? ''}`}
      aria-label={title}
    >
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  )
}
