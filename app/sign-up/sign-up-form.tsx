'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { signUp } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordField } from '@/components/auth/password-field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SignUpForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    <AuthShell>
      <Card className="w-full max-w-md border-border/60 bg-card/80 shadow-xl shadow-slate-900/5 backdrop-blur-sm dark:shadow-black/20 dark:bg-card/90">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Create your account
          </CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Add your details to get access to the sales dashboard and rep tools.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-5 pt-4">
            {error ? (
              <Alert variant="destructive" className="border-destructive/30">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="signup-name" className="text-foreground">
                Full name
              </Label>
              <Input
                id="signup-name"
                type="text"
                autoComplete="name"
                placeholder="Ada Obi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email" className="text-foreground">
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
                className="h-11"
              />
            </div>
            <PasswordField
              id="signup-password"
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              disabled={loading}
              required
              minLength={8}
              hint="Use at least 8 characters. Mix letters and numbers for a stronger password."
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-5 border-t border-border/60 bg-muted/20 pt-6 dark:bg-muted/10">
            <Button
              type="submit"
              className="h-11 w-full text-base font-semibold shadow-sm"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden
                  />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{' '}
              <Link
                href="/sign-in"
                className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
              >
                Sign in instead
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
