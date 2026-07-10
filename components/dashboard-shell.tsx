'use client'

import type { ReactNode } from 'react'
import { AppNavLinks } from '@/components/app-nav-links'
import { AppTopHeader } from '@/components/app-top-header'
import { AiAssistantPanel, AiAssistantProvider, AiAssistantTrigger } from '@/components/ai-assistant'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DesktopSidebarFrame,
  SidebarCollapseProvider,
} from '@/components/sidebar-collapse'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getMobileNavTitle } from '@/lib/nav'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type DashboardShellProps = {
  children: ReactNode
  headerActions?: ReactNode
  subHeader?: ReactNode
}

export function DashboardShell({ children, headerActions, subHeader }: DashboardShellProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const title = getMobileNavTitle(pathname)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!pathname) return
    void fetch('/api/activity/page-view', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathname,
        pageTitle: title || 'GELOS',
        visitedAt: new Date().toISOString(),
      }),
    }).catch(() => {})
  }, [pathname, title])

  return (
    <SidebarCollapseProvider>
      <AiAssistantProvider>
      <DesktopSidebarFrame>
        <div className="dashboard-surface flex min-h-0 min-w-0 flex-1 flex-col p-0 lg:p-3">
          <div className="dashboard-panel">
            <AppTopHeader actions={headerActions} />

            <header className="flex h-14 shrink-0 items-center gap-3 rounded-t-2xl border-b border-border/40 bg-card/90 px-4 backdrop-blur-md dark:border-border/30 dark:bg-card/80 lg:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-[min(100vw,20rem)] flex-col rounded-r-2xl border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-xl"
                >
                  <SheetHeader className="border-b border-sidebar-border p-4 text-left">
                    <SheetTitle className="text-lg font-bold text-sidebar-foreground">GELOS</SheetTitle>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-primary">
                      Navigate
                    </p>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto">
                    <AppNavLinks onNavigate={() => setOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{title}</h1>
              <ThemeToggle />
              <AiAssistantTrigger size="icon" showLabel={false} variant="ghost" />
            </header>

            {subHeader}

            <div className="dashboard-surface min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </div>
          </div>
        </div>
      </DesktopSidebarFrame>
      <AiAssistantPanel />
      </AiAssistantProvider>
    </SidebarCollapseProvider>
  )
}
