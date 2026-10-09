import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EditDiscount } from '@/components/discounts/discount-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Discount code' }
}

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DiscountPage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/admin/discounts"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Discount codes
      </Link>
      <div className="mt-2">
        <EditDiscount id={id} />
      </div>
    </main>
  )
}
