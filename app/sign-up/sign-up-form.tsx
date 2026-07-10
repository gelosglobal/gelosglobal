'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { signUp } from '@/lib/auth-client'
import { authInputClassName, authLabelClassName } from '@/components/auth/auth-field-styles'
import { AuthFormCard } from '@/components/auth/auth-form-card'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordField } from '@/components/auth/password-field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

function passwordStrength(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  return score
}

export function SignUpForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength = useMemo(() => passwordStrength(password), [password])
  const strengthLabel =
    password.length === 0
      ? null
      : strength <= 1
        ? 'Weak'
        : strength === 2
          ? 'Fair'
          : strength === 3
            ? 'Good'
            : 'Strong'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signUp.email({
        name,
        email,
        password,
      })
      if (result.error) {
        setError(result.error.message ?? 'Sign up failed')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell mode="sign-up">
      <AuthFormCard
        title="Create your account"
        description="Set up staff access to dashboards, retail tools, and live business intelligence."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          {error ? (
            <Alert variant="destructive" className="rounded-xl border-destructive/30">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name" className={authLabelClassName}>
                Full name
              </Label>
              <Input
                id="signup-name"
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Ada Obi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                className={authInputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email" className={authLabelClassName}>
                Work email
              </Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className={authInputClassName}
              />
            </div>
            <div className="space-y-2">
              <PasswordField
                id="signup-password"
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                disabled={loading}
                required
                minLength={8}
                hint="Use at least 8 characters with letters and numbers."
              />
              {strengthLabel ? (
                <div className="space-y-1.5 rounded-xl bg-muted/35 px-3 py-2.5 ring-1 ring-border/40">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors',
                          strength >= level
                            ? strength <= 1
                              ? 'bg-rose-500'
                              : strength === 2
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            : 'bg-muted-foreground/20',
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Password strength: <span className="font-medium text-foreground">{strengthLabel}</span>
                  </p>
                </div>
              ) : null}
            </div>
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
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="ml-2 h-4 w-4 opacity-80" />
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already registered?{' '}
              <Link
                href="/sign-in"
                className="font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                Sign in instead
              </Link>
            </p>
          </div>
        </form>
      </AuthFormCard>
    </AuthShell>
  )
}
