import type { Metadata } from 'next'
import { AuthCard } from '@/components/account/auth-card'
import { ForgotPasswordForm } from '@/components/account/forgot-password-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Forgot your password?', robots: { index: false, follow: false } }
}

export default function Page() {
  return (
    <AuthCard
      title="Forgot your password?"
      intro="Enter your email and we'll send you a link to choose a new one."
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
