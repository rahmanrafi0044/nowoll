import type { Metadata } from 'next'
import { MyOrders } from '@/components/account/my-orders'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your orders', robots: { index: false, follow: false } }
}

export default function Page() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Your orders</h1>
      <div className="mt-8">
        <MyOrders />
      </div>
    </>
  )
}
