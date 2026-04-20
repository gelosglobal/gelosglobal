'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { dtcNavItems, salesForceNavItems, sellInNavItems } from '@/lib/nav'

type AppNavLinksProps = {
  onNavigate?: () => void
}

export function AppNavLinks({ onNavigate }: AppNavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col px-3 py-4">
      <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-500">
        Main
      </p>
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          'mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
          pathname === '/'
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-700/60',
        )}
      >
        Master Dashboard
      </Link>
      <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700/60',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-500">
        Retail
      </p>
      <ul className="mb-4 space-y-1">
        {salesForceNavItems.map((item) => {
          const Icon = item.icon
          if (!item.href) {
            return (
              <li key={item.label}>
                <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500">
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
              </li>
            )
          }
          const active = pathname === item.href
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700/60',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700/60',
                )}
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
