import type { Metadata } from 'next'
import { AuthCard } from '@/components/account/auth-card'
import { ResetPasswordForm } from '@/components/account/reset-password-form'

// The link in the password-reset email lands here:
//   /reset-password?token_hash=…&type=recovery
// (Supabase email template — see docs/integrations/supabase.md → Auth.)
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Choose a new password', robots: { index: false, follow: false } }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }>
}) {
  const { token_hash: tokenHash, type } = await searchParams
  const valid = typeof tokenHash === 'string' && type === 'recovery'
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm tokenHash={valid ? tokenHash : null} />
    </AuthCard>
  )
}
