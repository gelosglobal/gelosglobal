import { ShieldCheck } from 'lucide-react'
import { gelosLogoFont } from '@/lib/fonts'
import { cn } from '@/lib/utils'

export function AuthLogoMark({
  className,
  onPanel = false,
}: {
  className?: string
  onPanel?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          gelosLogoFont.className,
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 text-base font-extrabold text-primary-foreground shadow-md shadow-primary/25',
        )}
      >
        G
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            gelosLogoFont.className,
            'text-xl font-extrabold tracking-wide',
            onPanel
              ? 'text-foreground dark:text-sidebar-foreground'
              : 'text-foreground',
          )}
        >
          GELOS
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          for staffs
        </p>
      </div>
    </div>
  )
}

export function AuthBrandPanel({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <div className="relative hidden overflow-hidden text-foreground lg:flex lg:flex-col lg:justify-between dark:text-sidebar-foreground">
      {/* Panel edge fade into form column */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background/70 to-transparent dark:from-background/20"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-center px-10 py-12 xl:px-14">
        <AuthLogoMark onPanel />

        <div className="mt-10 max-w-md space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground dark:text-sidebar-foreground xl:text-4xl">
            {mode === 'sign-in'
              ? 'Sign in to your operations hub'
              : 'Join your team on GELOS'}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground dark:text-sidebar-foreground/75">
            {mode === 'sign-in'
              ? 'Track sell-out, retail performance, receivables, and field activity from a single staff workspace.'
              : 'Create your staff account to access dashboards, rep tools, and AI-powered business insights.'}
          </p>
        </div>
      </div>

      <div className="relative border-t border-border/50 bg-gradient-to-r from-transparent via-muted/25 to-transparent px-10 py-5 dark:border-white/10 dark:via-white/[0.03] xl:px-14">
        <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-sidebar-foreground/65">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span>Staff-only access · Secure sign-in for your organization</span>
        </div>
      </div>
    </div>
  )
}
