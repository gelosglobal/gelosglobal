import type { ReactNode } from 'react'

type AuthShellProps = {
  children: ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-muted/45 to-background dark:from-muted/15">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
        {children}
      </div>
    </div>
  )
}
