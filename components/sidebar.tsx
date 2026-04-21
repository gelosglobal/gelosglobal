'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Home, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { dtcNavItems, salesForceNavItems, sellInNavItems } from '@/lib/nav'
import { getUserAccess } from '@/lib/access'
import { gelosLogoFont } from '@/lib/fonts'

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = useSession()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(['RETAIL']),
  )

  const access = useMemo(() => getUserAccess((session as any) ?? null), [session])

  useEffect(() => {
    if (pathname.startsWith('/dtc')) {
      setExpandedSections((prev) => new Set(prev).add('DTC'))
    }
    if (pathname.startsWith('/sell-in')) {
      setExpandedSections((prev) => new Set(prev).add('SELL-IN'))
    }
    if (pathname.startsWith('/sf')) {
      setExpandedSections((prev) => new Set(prev).add('RETAIL'))
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
          <h2
            className={cn(
              gelosLogoFont.className,
              'text-xl font-extrabold tracking-wide text-white',
            )}
          >
            GELOS
          </h2>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            for staffs
          </p>
        </div>
      </div>

      {access.sections.has('master') ? (
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
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {access.sections.has('dtc') ? (
        <div>
          <button
            type="button"
            onClick={() => toggleSection('DTC')}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-300"
          >
            DTC
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('DTC') && 'rotate-180',
              )}
            />
          </button>
          {expandedSections.has('DTC') && (
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
        ) : null}

        {access.sections.has('retail') ? (
        <div>
          <button
            type="button"
            onClick={() => toggleSection('RETAIL')}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-300"
          >
            RETAIL
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('RETAIL') && 'rotate-180',
              )}
            />
          </button>
          {expandedSections.has('RETAIL') && (
            <div className="mt-1 space-y-1">
              {(() => {
                const out: React.ReactNode[] = []
                for (let i = 0; i < salesForceNavItems.length; i += 1) {
                  const item = salesForceNavItems[i]!
                  const Icon = item.icon

                  // Hover-reveal submenu under "B2B Payments"
                  if (item.href === '/sf/b2b-payments') {
                    const children = []
                    let j = i + 1
                    while (j < salesForceNavItems.length && salesForceNavItems[j]?.indent === 1) {
                      children.push(salesForceNavItems[j]!)
                      j += 1
                    }
                    i = j - 1

                    const childActive = children.some((c) => c.href && pathname === c.href)
                    const active = pathname === item.href
                    const open = active || childActive

                    out.push(
                      <div key={item.href} className="group">
                        <Link
                          href={item.href}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                            active
                              ? 'bg-blue-600 text-white shadow-lg'
                              : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 shrink-0 opacity-70 transition-transform',
                              open
                                ? 'rotate-90'
                                : 'rotate-0 group-hover:rotate-90 group-hover:opacity-90',
                            )}
                          />
                        </Link>

                        <div
                          className={cn(
                            'mt-1 overflow-hidden pl-4 transition-all duration-200',
                            open
                              ? 'max-h-40 opacity-100'
                              : 'max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100',
                          )}
                        >
                          <div className="space-y-1 py-1">
                            {children.map((c) => {
                              const ChildIcon = c.icon
                              const cActive = pathname === c.href
                              return (
                                <Link
                                  key={c.href}
                                  href={c.href!}
                                  className={cn(
                                    'flex w-full items-center gap-3 rounded-lg px-4 py-2 text-[13px] font-medium transition',
                                    cActive
                                      ? 'bg-blue-600 text-white shadow-lg'
                                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                                  )}
                                >
                                  <ChildIcon className="h-4 w-4 shrink-0 opacity-90" />
                                  {c.label}
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                      </div>,
                    )
                    continue
                  }

                  if (item.href) {
                    const active = pathname === item.href
                    out.push(
                      <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                          item.indent === 1 && 'ml-4 pl-4 text-[13px]',
                          active
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>,
                    )
                    continue
                  }

                  out.push(
                    <span
                      key={item.label}
                      className="flex w-full cursor-default items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>,
                  )
                }
                return out
              })()}
            </div>
          )}
        </div>
        ) : null}

        {access.sections.has('sell-in') ? (
        <div>
          <button
            type="button"
            onClick={() => toggleSection('SELL-IN')}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-300"
          >
            SELL-IN
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('SELL-IN') && 'rotate-180',
              )}
            />
          </button>
          {expandedSections.has('SELL-IN') && (
            <div className="mt-1 space-y-1">
              {sellInNavItems.map((item) => {
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
        ) : null}
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
