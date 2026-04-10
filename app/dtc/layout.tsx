import { auth, ensureAuthMongo } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard-shell'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function DtcLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) {
    redirect('/sign-in')
  }
  return <DashboardShell>{children}</DashboardShell>
}
