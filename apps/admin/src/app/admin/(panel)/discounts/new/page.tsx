import type { Metadata } from 'next'
import Link from 'next/link'
import { NewDiscount } from '@/components/discounts/discount-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New discount code' }
}

export default function NewDiscountPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/admin/discounts"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Discount codes
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New discount code</h1>
      <NewDiscount />
    </main>
  )
}
