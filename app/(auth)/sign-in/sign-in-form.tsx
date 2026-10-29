'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { signIn } from '@/lib/auth-client'
import { safeMcpNext } from '@/lib/mcp/paths'
import { authInputClassName, authLabelClassName } from '@/components/auth/auth-field-styles'
import { AuthFormCard } from '@/components/auth/auth-form-card'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordField } from '@/components/auth/password-field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({
        email,
        password,
      })
      if (result.error) {
        setError(result.error.message ?? 'Sign in failed')
        return
      }
      const next = safeMcpNext(new URLSearchParams(window.location.search).get('next'))
      router.push(next ?? '/')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell mode="sign-in">
      <AuthFormCard
        title="Welcome back"
        description="Use your work email to access dashboards, rep tools, and GELOS AI."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {error ? (
            <Alert variant="destructive" className="rounded-xl border-destructive/30">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not sign you in</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email" className={authLabelClassName}>
                Work email
              </Label>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className={authInputClassName}
              />
            </div>
            <PasswordField
              id="signin-password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-4 pt-1">
            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold shadow-md shadow-primary/15 transition-transform active:scale-[0.99]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4 opacity-80" />
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              New to GELOS?{' '}
              <Link
                href="/sign-up"
                className="font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </form>
      </AuthFormCard>
    </AuthShell>
  )
}
