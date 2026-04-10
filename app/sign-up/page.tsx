import { auth, ensureAuthMongo } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignUpForm } from './sign-up-form'

export default async function SignUpPage() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (session) {
    redirect('/')
  }
  return <SignUpForm />
}
