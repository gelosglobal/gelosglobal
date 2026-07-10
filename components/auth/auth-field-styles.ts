import { cn } from '@/lib/utils'

/** Shared input styling for auth forms */
export const authInputClassName = cn(
  'h-12 rounded-xl border-0 bg-muted/45 shadow-none ring-1 ring-border/55',
  'transition-all placeholder:text-muted-foreground/55',
  'focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/30',
  'dark:bg-muted/25 dark:ring-border/45 dark:focus-visible:bg-card',
)

export const authLabelClassName = 'text-sm font-medium text-foreground'
