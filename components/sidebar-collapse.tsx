'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/sidebar'

const STORAGE_KEY = 'gelos-sidebar-collapsed'
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '4.5rem'

type SidebarCollapseContextValue = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null)

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setCollapsedState(true)
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    localStorage.setItem(STORAGE_KEY, String(value))
  }, [])

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle],
  )

  return (
    <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>
  )
}

export function useSidebarCollapse() {
  const context = useContext(SidebarCollapseContext)
  if (!context) {
    throw new Error('useSidebarCollapse must be used within SidebarCollapseProvider')
  }
  return context
}

export function DesktopSidebarFrame({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebarCollapse()

  return (
    <div className="flex h-screen min-w-0 overflow-x-hidden bg-background">
      <div
        className="hidden h-screen shrink-0 p-3 transition-[width] duration-200 ease-in-out lg:block"
        style={{
          width: collapsed
            ? `calc(${SIDEBAR_WIDTH_ICON} + 1.5rem)`
            : `calc(${SIDEBAR_WIDTH} + 1.5rem)`,
        }}
      >
        <Sidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export function SidebarExpandButton({ className }: { className?: string }) {
  const { collapsed, setCollapsed } = useSidebarCollapse()
  if (!collapsed) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn('hidden shrink-0 lg:inline-flex', className)}
      onClick={() => setCollapsed(false)}
      aria-label="Expand sidebar"
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  )
}

export function SidebarExpandBar({ children }: { children?: ReactNode }) {
  const { collapsed } = useSidebarCollapse()
  if (!collapsed) return null

  return (
    <div className="hidden h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4 lg:flex">
      <SidebarExpandButton />
      {children}
    </div>
  )
}
