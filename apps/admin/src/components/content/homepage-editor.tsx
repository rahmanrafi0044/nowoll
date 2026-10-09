'use client'

import type { ReactNode } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchContentBlocks } from '@/lib/content-api'
import { fetchCategories } from '@/lib/products-api'
import { HeroEditor } from './hero-editor'
import { LayoutEditor } from './layout-editor'

/** Admin → Content → Homepage (step 36): the hero, then the list of sections. */
export function HomepageEditor() {
  const { state, retry, refresh } = useLoad(fetchContentBlocks)
  const categories = useLoad(fetchCategories)
  return (
    <Panel title="Homepage" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(blocks) => {
        const hero = blocks.find((b) => b.key === 'homepage_hero')!
        const layout = blocks.find((b) => b.key === 'homepage_layout')!
        return (
          <div className="flex flex-col gap-6">
            <Card title="Hero">
              <HeroEditor key={hero.updatedAt ?? 'new'} block={hero} onSaved={refresh} />
            </Card>
            <Card title="Sections">
              <p className="mb-4 text-sm text-muted-foreground">
                The homepage shows these from top to bottom. Hidden sections stay here for later.
              </p>
              <LayoutEditor
                key={layout.updatedAt ?? 'new'}
                block={layout}
                categories={categories.state.status === 'ok' ? categories.state.data : []}
                onSaved={refresh}
              />
            </Card>
          </div>
        )
      }}
    </Panel>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
