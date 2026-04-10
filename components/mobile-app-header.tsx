'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
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

export function MobileAppHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const title = getMobileNavTitle(pathname)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
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
  )
}
