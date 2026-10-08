import type { Metadata } from 'next'
import { CustomerList } from '@/components/customers/customer-list'
import { parseCustomerFilters } from '@/lib/customer-filters'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Customers' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function CustomersPage({ searchParams }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CustomerList filters={parseCustomerFilters(await searchParams)} />
    </main>
  )
}
