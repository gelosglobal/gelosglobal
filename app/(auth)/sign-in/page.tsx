import { auth, ensureAuthMongo } from '@/lib/auth'
import { safeMcpNext } from '@/lib/mcp/paths'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignInForm } from './sign-in-form'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next
  const next = safeMcpNext(nextRaw)
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (session) {
    redirect(next ?? '/')
  }
  return <SignInForm />
}
