import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditZone } from '@/components/shipping/zone-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Delivery zone' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditZonePage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <EditZone id={id} />
    </main>
  )
}
