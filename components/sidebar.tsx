'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Home, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { dtcNavItems, salesForceNavItems } from '@/lib/nav'

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = useSession()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(['SALES FORCE']),
  )

  useEffect(() => {
    if (pathname.startsWith('/dtc')) {
      setExpandedSections((prev) => new Set(prev).add('DTC / SELL-OUT'))
    }
  }, [pathname])

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div className="flex h-screen w-64 flex-col border-r border-slate-700 bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100">
      <div className="border-b border-slate-700 p-6">
        <div className="mb-1">
          <h2 className="text-xl font-bold tracking-wide text-white">GELOS</h2>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Full Operating System v2
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <Link
          href="/"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition',
            pathname === '/'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-slate-700/50 text-white hover:bg-slate-600',
          )}
        >
          <Home className="h-4 w-4" />
          Master Dashboard
        </Link>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        <div>
          <button
            type="button"
            onClick={() => toggleSection('DTC / SELL-OUT')}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-300"
          >
            DTC / SELL-OUT
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('DTC / SELL-OUT') && 'rotate-180',
              )}
            />
          </button>
          {expandedSections.has('DTC / SELL-OUT') && (
            <div className="mt-1 space-y-1">
              {dtcNavItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                      active
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => toggleSection('SALES FORCE')}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-300"
          >
            SALES FORCE
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('SALES FORCE') && 'rotate-180',
              )}
            />
          </button>
          {expandedSections.has('SALES FORCE') && (
            <div className="mt-1 space-y-1">
              {salesForceNavItems.map((item) => {
                const Icon = item.icon
                if (item.href) {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                        active
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  )
                }
                return (
                  <span
                    key={item.label}
                    className="flex w-full cursor-default items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-700 p-4">
        <div className="rounded-lg bg-slate-800/80 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Signed in
          </p>
          <p className="truncate text-sm font-medium text-slate-100">
            {isPending
              ? '…'
              : session?.user?.name || session?.user?.email || 'User'}
          </p>
          {!isPending &&
          session?.user?.email &&
          session.user.name &&
          session.user.name !== session.user.email ? (
            <p className="truncate text-xs text-slate-400">{session.user.email}</p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-center gap-2 bg-slate-700 text-slate-100 hover:bg-slate-600"
          onClick={async () => {
            await signOut()
            router.push('/sign-in')
            router.refresh()
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <p className="text-center text-xs text-slate-400">© 2026 GELOS</p>
      </div>
    </div>
  )
}
