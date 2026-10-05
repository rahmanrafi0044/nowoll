import type { Metadata } from 'next'
import { AuthCard } from '@/components/account/auth-card'
import { LoginForm } from '@/components/account/login-form'

// Spec: "Sign in — /login — Client-side". The page shell is server-rendered; the form
// runs in the browser and talks to the API, which sets the login cookies.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Sign in', robots: { index: false, follow: false } }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  return (
    <AuthCard title="Sign in" intro="Track orders and check out faster.">
      <LoginForm next={typeof next === 'string' ? next : null} />
    </AuthCard>
  )
}
