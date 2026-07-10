'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, PanelLeft, Search } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { getPageBreadcrumb } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSidebarCollapse } from '@/components/sidebar-collapse'

type AppTopHeaderProps = {
  actions?: ReactNode
  className?: string
}

export function AppTopHeader({ actions, className }: AppTopHeaderProps) {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebarCollapse()
  const { data: session } = useSession()
  const { section, title } = getPageBreadcrumb(pathname)

  const displayName = session?.user?.name || session?.user?.email || 'User'
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <header
      className={cn(
        'sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-card/90 px-4 backdrop-blur-md lg:flex',
        className,
      )}
    >
      {collapsed ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="font-medium text-muted-foreground">{section}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span className="truncate font-semibold text-foreground">{title}</span>
      </div>

      <div className="mx-auto hidden w-full max-w-md xl:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            placeholder="Search pages, orders, outlets…"
            className="h-9 border-border/70 bg-muted/40 pl-9 text-sm shadow-none"
          />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 pl-1 pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || 'U'}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">Staff</p>
          </div>
        </div>
      </div>
    </header>
  )
}
