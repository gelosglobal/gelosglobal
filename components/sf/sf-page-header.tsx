import type { ReactNode } from 'react'

type SfPageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
}

export function SfPageHeader({
  title,
  description,
  actions,
}: SfPageHeaderProps) {
  return (
    <div className="border-b border-border bg-card px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Sales Force
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
