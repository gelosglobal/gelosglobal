import { auth, ensureAuthMongo } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignInForm } from './sign-in-form'

export default async function SignInPage() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (session) {
    redirect('/')
  }
  return <SignInForm />
}
