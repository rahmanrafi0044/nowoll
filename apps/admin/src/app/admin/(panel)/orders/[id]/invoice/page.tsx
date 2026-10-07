import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Invoice } from '@/components/orders/invoice'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Invoice' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function InvoicePage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:p-0">
      <Invoice id={id} />
    </main>
  )
}
