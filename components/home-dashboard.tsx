'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { MobileAppHeader } from '@/components/mobile-app-header'
import { ManagerDashboard } from '@/components/manager-dashboard'
import { RepView } from '@/components/rep-view'
import { Button } from '@/components/ui/button'

export function HomeDashboard() {
  const [view, setView] = useState<'manager' | 'rep'>('manager')

  return (
    <div className="flex h-screen bg-background">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <MobileAppHeader />

        <div className="flex gap-2 border-b border-border bg-card p-3 lg:hidden">
          <Button
            type="button"
            variant={view === 'manager' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setView('manager')}
          >
            Manager Dashboard
          </Button>
          <Button
            type="button"
            variant={view === 'rep' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setView('rep')}
          >
            Rep View
          </Button>
        </div>

        <div className="hidden gap-4 border-b border-border bg-card p-4 lg:flex">
          <Button
            type="button"
            onClick={() => setView('manager')}
            variant={view === 'manager' ? 'default' : 'outline'}
          >
            Manager Dashboard
          </Button>
          {/* <Button
            type="button"
            onClick={() => setView('rep')}
            variant={view === 'rep' ? 'default' : 'outline'}
          >
            Rep View
          </Button> */}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'manager' ? <ManagerDashboard /> : <RepView />}
        </div>
      </div>
    </div>
  )
}
