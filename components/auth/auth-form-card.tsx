import type { ReactNode } from 'react'
import { AuthLogoMark } from '@/components/auth/auth-brand-panel'
import { cn } from '@/lib/utils'

type AuthFormCardProps = {
  title: string
  description: string
  children: ReactNode
  className?: string
}

export function AuthFormCard({ title, description, children, className }: AuthFormCardProps) {
  return (
    <div className={cn('relative w-full max-w-[440px]', className)}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -inset-3 rounded-[1.75rem] bg-gradient-to-br from-primary/[0.08] via-chart-3/[0.05] to-chart-2/[0.07] opacity-80 blur-2xl dark:from-primary/15 dark:via-chart-3/10 dark:to-chart-2/12"
        aria-hidden
      />

      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border border-border/55 bg-card/95 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)] backdrop-blur-xl',
          'dark:border-border/40 dark:bg-card/90 dark:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)]',
        )}
      >
        {/* Top accent */}
        <div
          className="h-1 w-full bg-gradient-to-r from-primary/80 via-chart-3/70 to-chart-2/60 dark:from-primary dark:via-chart-3/80 dark:to-chart-2/70"
          aria-hidden
        />

        {/* Inner wash */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/25 via-transparent to-primary/[0.02] dark:from-muted/10 dark:to-primary/[0.04]"
          aria-hidden
        />

        <div className="relative px-7 py-8 sm:px-9 sm:py-9">
          {/* Desktop: small brand mark above title */}
          <div className="mb-7 hidden lg:block">
            <AuthLogoMark onPanel className="scale-95 origin-left opacity-90" />
          </div>

          <header className="mb-7 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Staff portal
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.65rem] sm:leading-tight">
              {title}
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
          </header>

          {children}
        </div>
      </div>
    </div>
  )
}
