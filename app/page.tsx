import { auth, ensureAuthMongo } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { HomeDashboard } from '@/components/home-dashboard'
import { canAccessPath, getUserAccess } from '@/lib/access'

export default async function HomePage() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/sign-in')
  }

  const access = getUserAccess(session as any)
  if (!canAccessPath(access, '/')) {
    redirect(access.homePath)
  }

  return <HomeDashboard />
}
