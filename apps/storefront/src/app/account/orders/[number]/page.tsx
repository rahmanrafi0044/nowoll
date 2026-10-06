import type { Metadata } from 'next'
import { MyOrder } from '@/components/account/my-order'

// /account/orders/NW-10001 — the order NUMBER in the address (what customers
// recognise); the API checks the order is yours.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>
}): Promise<Metadata> {
  const { number } = await params
  return {
    title: `Order ${decodeURIComponent(number).toUpperCase()}`,
    robots: { index: false, follow: false },
  }
}

export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params
  return <MyOrder number={decodeURIComponent(number)} />
}
