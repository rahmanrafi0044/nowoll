import type { Metadata } from 'next'
import { AuthCard } from '@/components/account/auth-card'
import { RegisterForm } from '@/components/account/register-form'

// Spec: "Create an account — /register — Client-side". The page shell is server-rendered; the form
// runs in the browser and talks to the API, which sets the login cookies.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Create an account', robots: { index: false, follow: false } }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  return (
    <AuthCard
      title="Create an account"
      intro="Faster checkout, and your orders in one place. Guest checkout still works too."
    >
      <RegisterForm next={typeof next === 'string' ? next : null} />
    </AuthCard>
  )
}
