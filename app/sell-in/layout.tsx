import { auth, ensureAuthMongo } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard-shell'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canAccessPath, getUserAccess } from '@/lib/access'

export default async function SellInLayout({
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
  const access = getUserAccess(session as any)
  if (!canAccessPath(access, '/sell-in')) {
    redirect(access.homePath)
  }
  return <DashboardShell>{children}</DashboardShell>
}

