'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSidebarCollapse } from '@/components/sidebar-collapse'
import { dtcNavItems, salesForceNavItems, sellInNavItems } from '@/lib/nav'
import { getUserAccess } from '@/lib/access'
import { gelosLogoFont } from '@/lib/fonts'

function navItemClass(active: boolean, collapsed: boolean) {
  return cn(
    'flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
    active
      ? cn(
          'shadow-none',
          'bg-primary/10 text-primary ring-1 ring-primary/15',
          'dark:bg-white dark:text-neutral-950 dark:ring-0',
        )
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
  )
}

function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  collapsed: boolean
}) {
  const link = (
    <Link href={href} className={navItemClass(active, collapsed)} title={collapsed ? label : undefined}>
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebarCollapse()
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

  const displayName = session?.user?.name || session?.user?.email || 'User'
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  const flatNavItems = useMemo(() => {
    const items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }> = []
    if (access.sections.has('master')) {
      items.push({ href: '/', label: 'Master Dashboard', icon: Home })
    }
    if (access.sections.has('dtc')) {
      for (const item of dtcNavItems) {
        if (item.href) items.push({ href: item.href, label: item.label, icon: item.icon })
      }
    }
    if (access.sections.has('retail')) {
      for (const item of salesForceNavItems) {
        if (item.href) items.push({ href: item.href, label: item.label, icon: item.icon })
      }
    }
    if (access.sections.has('sell-in')) {
      for (const item of sellInNavItems) {
        if (item.href) items.push({ href: item.href, label: item.label, icon: item.icon })
      }
    }
    return items
  }, [access.sections])

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md ring-1 ring-border/40 dark:border-sidebar-border dark:shadow-none dark:ring-border/25',
        )}
      >
        <div
          className={cn(
            'flex items-center border-b border-sidebar-border/80 bg-sidebar',
            collapsed ? 'justify-center px-2 py-4' : 'justify-between gap-2 px-4 py-5',
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggle}
              className={cn(
                gelosLogoFont.className,
                'flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-sm',
              )}
              aria-label="Expand sidebar"
            >
              G
            </button>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    gelosLogoFont.className,
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-sm',
                  )}
                >
                  G
                </div>
                <div className="min-w-0">
                  <h2
                    className={cn(
                      gelosLogoFont.className,
                      'truncate text-lg font-extrabold tracking-wide text-sidebar-foreground',
                    )}
                  >
                    GELOS
                  </h2>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                    for staffs
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={toggle}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {collapsed ? (
          <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {flatNavItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname === item.href}
                collapsed
              />
            ))}
          </div>
        ) : (
          <>
            {access.sections.has('master') ? (
              <div className="px-3 py-3">
                <SidebarNavItem
                  href="/"
                  label="Master Dashboard"
                  icon={Home}
                  active={pathname === '/'}
                  collapsed={false}
                />
              </div>
            ) : null}

            <div className="flex-1 space-y-3 overflow-y-auto px-2 py-2">
              {access.sections.has('dtc') ? (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('DTC')}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50 transition hover:text-sidebar-foreground/80"
                  >
                    DTC
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        expandedSections.has('DTC') && 'rotate-180',
                      )}
                    />
                  </button>
                  {expandedSections.has('DTC') ? (
                    <div className="mt-1 space-y-0.5">
                      {dtcNavItems.map((item) => (
                        <SidebarNavItem
                          key={item.href}
                          href={item.href!}
                          label={item.label}
                          icon={item.icon}
                          active={pathname === item.href}
                          collapsed={false}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {access.sections.has('retail') ? (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('RETAIL')}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50 transition hover:text-sidebar-foreground/80"
                  >
                    Retail
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        expandedSections.has('RETAIL') && 'rotate-180',
                      )}
                    />
                  </button>
                  {expandedSections.has('RETAIL') ? (
                    <div className="mt-1 space-y-0.5">
                      {(() => {
                        const out: ReactNode[] = []
                        for (let i = 0; i < salesForceNavItems.length; i += 1) {
                          const item = salesForceNavItems[i]!
                          const Icon = item.icon

                          if (item.href === '/sf/b2b-payments') {
                            const children = []
                            let j = i + 1
                            while (
                              j < salesForceNavItems.length &&
                              salesForceNavItems[j]?.indent === 1
                            ) {
                              children.push(salesForceNavItems[j]!)
                              j += 1
                            }
                            i = j - 1

                            const childActive = children.some(
                              (c) => c.href && pathname === c.href,
                            )
                            const active = pathname === item.href
                            const open = active || childActive

                            out.push(
                              <div key={item.href} className="group">
                                <Link
                                  href={item.href}
                                  className={navItemClass(active, false)}
                                >
                                  <Icon className="h-4 w-4 shrink-0" />
                                  <span className="flex-1 truncate">{item.label}</span>
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
                                    'mt-0.5 overflow-hidden pl-3 transition-all duration-200',
                                    open
                                      ? 'max-h-40 opacity-100'
                                      : 'max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100',
                                  )}
                                >
                                  <div className="space-y-0.5 py-1">
                                    {children.map((c) => (
                                      <SidebarNavItem
                                        key={c.href}
                                        href={c.href!}
                                        label={c.label}
                                        icon={c.icon}
                                        active={pathname === c.href}
                                        collapsed={false}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>,
                            )
                            continue
                          }

                          if (item.href) {
                            out.push(
                              <SidebarNavItem
                                key={item.label}
                                href={item.href}
                                label={item.label}
                                icon={item.icon}
                                active={pathname === item.href}
                                collapsed={false}
                              />,
                            )
                            continue
                          }

                          out.push(
                            <span
                              key={item.label}
                              className="flex w-full cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40"
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              {item.label}
                            </span>,
                          )
                        }
                        return out
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {access.sections.has('sell-in') ? (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('SELL-IN')}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50 transition hover:text-sidebar-foreground/80"
                  >
                    Sell-in
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        expandedSections.has('SELL-IN') && 'rotate-180',
                      )}
                    />
                  </button>
                  {expandedSections.has('SELL-IN') ? (
                    <div className="mt-1 space-y-0.5">
                      {sellInNavItems.map((item) => (
                        <SidebarNavItem
                          key={item.href}
                          href={item.href!}
                          label={item.label}
                          icon={item.icon}
                          active={pathname === item.href}
                          collapsed={false}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className={cn('border-t border-sidebar-border/80 bg-sidebar', collapsed ? 'p-2' : 'space-y-3 p-3')}>
          {!collapsed ? (
            <div className="rounded-xl border border-sidebar-border bg-muted/30 px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">
                    {isPending ? '…' : displayName}
                  </p>
                  {!isPending && session?.user?.email ? (
                    <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials || 'U'}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{displayName}</TooltipContent>
            </Tooltip>
          )}

          {collapsed ? (
            <div className="mt-2 flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    onClick={toggle}
                    aria-label="Expand sidebar"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    onClick={async () => {
                      await signOut()
                      router.push('/sign-in')
                      router.refresh()
                    }}
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-2 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={async () => {
                await signOut()
                router.push('/sign-in')
                router.refresh()
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
