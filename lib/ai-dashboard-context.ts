import type { AppSection } from '@/lib/access'
import { getUserAccess } from '@/lib/access'
import { computeDtcDashboardSnapshot } from '@/lib/dtc-dashboard'
import { computeFinanceLayerSnapshot, sfB2bInvoiceEffectiveDate } from '@/lib/dtc-finance'
import { computeInventoryStats, computeStockHealth, listDtcInventory } from '@/lib/dtc-inventory'
import { computeSfDashboardSnapshot } from '@/lib/sf-dashboard'
import { listSfInventoryWithOrderVelocity } from '@/lib/sf-inventory'
import { computeInvoiceKpis, listSfB2bInvoices } from '@/lib/sf-b2b-invoices'
import { REP_TASKS_COLLECTION, serializeRepTask, type RepTaskDoc } from '@/lib/rep-tasks'
import type { Db } from 'mongodb'
import { subDays } from 'date-fns'

export type AiDashboardContext = {
  generatedAt: string
  user: {
    name: string | null
    email: string | null
    sections: AppSection[]
  }
  currentPage: string | null
  dtc: Record<string, unknown> | null
  retail: Record<string, unknown> | null
  finance: Record<string, unknown> | null
  tasks: Array<{
    title: string
    status: string
    priority: string
    dueAt: string | null
  }> | null
}

type AiSession = {
  user?: {
    name?: string | null
    email?: string | null
    id?: string | null
  }
}

function repIdentifiers(session: AiSession): string[] {
  const raw = [session.user?.name, session.user?.email, session.user?.id]
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
  return Array.from(new Set(raw))
}

function summarizeDtcInventory(items: Awaited<ReturnType<typeof listDtcInventory>>) {
  const stats = computeInventoryStats(items)
  let critical = 0
  let low = 0
  const belowSafetySamples = items
    .filter((r) => r.onHand < r.safetyStock)
    .slice(0, 5)
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      warehouse: r.warehouse,
      onHand: r.onHand,
      safetyStock: r.safetyStock,
      health: computeStockHealth(r.onHand, r.safetyStock),
    }))
  for (const r of items) {
    const h = computeStockHealth(r.onHand, r.safetyStock)
    if (h === 'critical') critical += 1
    else if (h === 'low') low += 1
  }
  return { stats, critical, low, belowSafetySamples }
}

function summarizeSfInventory(
  payload: Awaited<ReturnType<typeof listSfInventoryWithOrderVelocity>>,
) {
  const { items, stats } = payload
  const critical = items.filter((r) => r.health === 'critical').length
  const low = items.filter((r) => r.health === 'low').length
  const lowestCover = [...items]
    .filter((r) => r.daysCover !== null)
    .sort((a, b) => (a.daysCover ?? 999) - (b.daysCover ?? 999))
    .slice(0, 5)
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      onHand: r.onHand,
      daysCover: r.daysCover,
      health: r.health,
    }))
  return { stats, critical, low, lowestCover }
}

export async function buildAiDashboardContext(
  db: Db,
  session: AiSession,
  currentPage?: string | null,
): Promise<AiDashboardContext> {
  const access = getUserAccess(session as any)
  const now = new Date()
  const rangeStart = subDays(now, 7)
  const financeDays = 30

  const context: AiDashboardContext = {
    generatedAt: now.toISOString(),
    user: {
      name: session.user?.name ?? null,
      email: access.email,
      sections: Array.from(access.sections),
    },
    currentPage: currentPage ?? null,
    dtc: null,
    retail: null,
    finance: null,
    tasks: null,
  }

  const jobs: Promise<void>[] = []

  if (access.sections.has('dtc') || access.sections.has('master')) {
    jobs.push(
      (async () => {
        const [dashboard, inventoryRows, financeResult] = await Promise.all([
          computeDtcDashboardSnapshot(db, 0),
          listDtcInventory(db),
          computeFinanceLayerSnapshot(db, financeDays),
        ])
        const inventory = summarizeDtcInventory(inventoryRows)
        const finance = financeResult.snapshot
        context.dtc = {
          dashboard: {
            kpis: dashboard.kpis,
            topSkus: dashboard.topSkus.slice(0, 8),
            alerts: dashboard.alerts.slice(0, 12),
            period: {
              start: dashboard.periodStart,
              end: dashboard.periodEnd,
              days: dashboard.periodDays,
            },
          },
          inventory,
        }
        context.finance = {
          periodDays: finance.periodDays,
          periodStart: finance.periodStart,
          periodEnd: finance.periodEnd,
          dtcRevenue: finance.dtcRevenue,
          b2bCollected: finance.b2bCollected,
          totalRevenue: finance.totalRevenue,
          grossProfit: finance.grossProfit,
          netProfit: finance.netProfit,
          b2bOutstandingGhs: finance.b2bOutstandingGhs,
          marketingSpendGhs: finance.marketingSpendGhs,
          cogsGhs: finance.cogsGhs,
        }
      })(),
    )
  }

  if (access.sections.has('retail') || access.sections.has('master')) {
    jobs.push(
      (async () => {
        const [sfDashboard, sfInventory, invoicesAll] = await Promise.all([
          computeSfDashboardSnapshot(db, { rangeStart, rangeEnd: now }),
          listSfInventoryWithOrderVelocity(db),
          listSfB2bInvoices(db),
        ])
        const since30 = subDays(now, 30)
        const invoices30d = invoicesAll.filter((r) => {
          const d = sfB2bInvoiceEffectiveDate(r)
          return d && !Number.isNaN(d.getTime()) && d >= since30 && d <= now
        })
        const b2bKpis = computeInvoiceKpis(invoices30d, now)
        const inventory = summarizeSfInventory(sfInventory)
        context.retail = {
          dashboard: {
            rangeStart: sfDashboard.rangeStart,
            rangeEnd: sfDashboard.rangeEnd,
            primaryRegionLabel: sfDashboard.primaryRegionLabel,
            kpis: sfDashboard.kpis,
            upcomingVisits: sfDashboard.upcomingVisits.slice(0, 8),
            repPulse: sfDashboard.repPulse.slice(0, 8),
            alerts: sfDashboard.alerts.slice(0, 12),
          },
          inventory,
          b2bPayments30d: b2bKpis,
        }
      })(),
    )
  }

  jobs.push(
    (async () => {
      const reps = repIdentifiers(session)
      if (reps.length === 0) return
      const rows = await db
        .collection<RepTaskDoc>(REP_TASKS_COLLECTION)
        .find({ repName: { $in: reps } })
        .sort({ updatedAt: -1 })
        .limit(12)
        .toArray()
      context.tasks = rows.map((r) => {
        const t = serializeRepTask(r as RepTaskDoc)
        return {
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueAt: t.dueAt,
        }
      })
    })(),
  )

  await Promise.all(jobs)
  return context
}

export function formatAiDashboardContextForPrompt(context: AiDashboardContext): string {
  return JSON.stringify(context, null, 2)
}
