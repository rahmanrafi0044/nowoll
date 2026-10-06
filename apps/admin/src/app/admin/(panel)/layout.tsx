import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin-shell'

// A ROUTE GROUP: the "(panel)" folder doesn't appear in URLs — /admin/dashboard
// stays /admin/dashboard. It lets every signed-in page share this layout,
// while /admin/login (outside the group) doesn't get it.
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
