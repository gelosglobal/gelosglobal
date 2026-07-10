'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { dtcNavItems, salesForceNavItems, sellInNavItems } from '@/lib/nav'
import { useMemo } from 'react'
import { useSession } from '@/lib/auth-client'
import { getUserAccess } from '@/lib/access'
import { ChevronRight } from 'lucide-react'

type AppNavLinksProps = {
  onNavigate?: () => void
}

function navClass(active: boolean) {
  return cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    active
      ? 'bg-primary/10 text-primary ring-1 ring-primary/15'
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
  )
}

export function AppNavLinks({ onNavigate }: AppNavLinksProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const access = useMemo(() => getUserAccess((session as any) ?? null), [session])

  return (
    <nav className="flex flex-col px-3 py-4 text-sidebar-foreground">
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
        Main
      </p>
      {access.sections.has('master') ? (
        <Link
          href="/"
          onClick={onNavigate}
          className={cn('mb-4', navClass(pathname === '/'))}
        >
          Master Dashboard
        </Link>
      ) : null}
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
        DTC
      </p>
      <ul className="mb-4 space-y-1">
        {dtcNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <li key={item.href}>
              <Link
                href={item.href!}
                onClick={onNavigate}
                className={navClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
        Retail
      </p>
      <ul className="mb-4 space-y-1">
        {(() => {
          const out: React.ReactNode[] = []
          for (let i = 0; i < salesForceNavItems.length; i += 1) {
            const item = salesForceNavItems[i]!
            const Icon = item.icon

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
                <li key={item.href} className="group">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={navClass(active)}
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
                      'overflow-hidden pl-4 transition-all duration-200',
                      open
                        ? 'max-h-40 opacity-100'
                        : 'max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100',
                    )}
                  >
                    <ul className="mt-1 space-y-1 py-1">
                      {children.map((c) => {
                        const ChildIcon = c.icon
                        const cActive = pathname === c.href
                        return (
                          <li key={c.href}>
                            <Link
                              href={c.href!}
                              onClick={onNavigate}
                              className={cn(navClass(cActive), 'text-[13px]')}
                            >
                              <ChildIcon className="h-4 w-4 shrink-0 opacity-90" />
                              {c.label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </li>,
              )
              continue
            }

            if (!item.href) {
              out.push(
                <li key={item.label}>
                  <span className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/40">
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </span>
                </li>,
              )
              continue
            }

            const active = pathname === item.href
            out.push(
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(navClass(active), item.indent === 1 && 'ml-4 pl-4 text-[13px]')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>,
            )
          }
          return out
        })()}
      </ul>
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
        Sell-in
      </p>
      <ul className="space-y-1">
        {sellInNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <li key={item.href}>
              <Link
                href={item.href!}
                onClick={onNavigate}
                className={navClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
