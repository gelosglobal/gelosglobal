'use client'

import { Sidebar } from '@/components/sidebar'
import { AppNavLinks } from '@/components/app-nav-links'
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const title = getMobileNavTitle(pathname)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!pathname) return
    // Fire-and-forget activity log; don't block UI.
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
    <div className="flex h-screen min-w-0 overflow-x-hidden bg-background">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(100vw,20rem)] flex-col border-slate-700 bg-gradient-to-b from-slate-900 to-slate-800 p-0 text-slate-100"
            >
              <SheetHeader className="border-b border-slate-700 p-4 text-left">
                <SheetTitle className="text-lg font-bold text-white">GELOS</SheetTitle>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                  Navigate
                </p>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <AppNavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
