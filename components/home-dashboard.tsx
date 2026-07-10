'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/dashboard-shell'
import { ManagerDashboard } from '@/components/manager-dashboard'
import { RepView } from '@/components/rep-view'
import { Button } from '@/components/ui/button'

export function HomeDashboard() {
  const [view, setView] = useState<'manager' | 'rep'>('manager')
  const [taskOpen, setTaskOpen] = useState(false)

  return (
    <DashboardShell
      headerActions={
        <Button type="button" size="sm" onClick={() => setTaskOpen(true)}>
          Assign task
        </Button>
      }
      subHeader={
        <div className="flex gap-2 border-b border-border/70 bg-card/90 p-3 backdrop-blur-md lg:hidden">
          {view === 'manager' ? (
            <Button type="button" className="flex-1" onClick={() => setTaskOpen(true)}>
              Assign task
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setView('manager')}
            >
              Master Dashboard
            </Button>
          )}
          <Button
            type="button"
            variant={view === 'rep' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setView('rep')}
          >
            Rep View
          </Button>
        </div>
      }
    >
      {view === 'manager' ? (
        <ManagerDashboard taskOpen={taskOpen} onTaskOpenChange={setTaskOpen} />
      ) : (
        <RepView />
      )}
    </DashboardShell>
  )
}
