import type { AppSection } from '@/lib/access'
import { computeSfDashboardSnapshot } from '@/lib/sf-dashboard'
import { getUserAccess } from '@/lib/access'
import { computeDtcDashboardSnapshot } from '@/lib/dtc-dashboard'
import { computeFinanceLayerSnapshot, sfB2bInvoiceEffectiveDate, type FinanceLayerSnapshot } from '@/lib/dtc-finance'
import { computeMarketingAttribution } from '@/lib/dtc-marketing-attribution'
import { computeProductPerformance } from '@/lib/dtc-product-performance'
import { computeInventoryStats, computeStockHealth, listDtcInventory } from '@/lib/dtc-inventory'
import { computeSfProductPerformance } from '@/lib/sf-product-performance'
import { computeSfLeaderboard, defaultSfLeaderboardRange } from '@/lib/sf-leaderboard'
import {
  computeSfTargetsMtdSummary,
  computeSfTargetsWithActuals,
  type SfRepTargetWithActuals,
  type SfTargetMonthKey,
} from '@/lib/sf-targets'
import { listSfInventoryWithOrderVelocity } from '@/lib/sf-inventory'
import { computeRetailCustomerIntelligence } from '@/lib/sf-customer-intelligence'
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
  teamTasks: Array<{
    repName: string
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

const CUSTOMER_BALANCE_THRESHOLDS_GHS = [
  1_000, 2_000, 5_000, 8_000, 10_000, 15_000, 20_000, 50_000,
] as const

function currentMonthKey(now = new Date()): SfTargetMonthKey {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function summarizeFinanceForAi(finance: FinanceLayerSnapshot) {
  const grossMarginPct =
    finance.totalRevenue > 0
      ? Math.round((finance.grossProfit / finance.totalRevenue) * 1000) / 10
      : 0
  const netMarginPct =
    finance.totalRevenue > 0
      ? Math.round((finance.netProfit / finance.totalRevenue) * 1000) / 10
      : 0
  return {
    periodDays: finance.periodDays,
    periodStart: finance.periodStart,
    periodEnd: finance.periodEnd,
    dtcRevenue: finance.dtcRevenue,
    b2bPortalOrderRevenue: finance.b2bPortalOrderRevenue,
    b2bInvoicePaidGhs: finance.b2bInvoicePaidGhs,
    b2bCashCollections: finance.b2bCashCollections,
    b2bCollected: finance.b2bCollected,
    totalRevenue: finance.totalRevenue,
    cogsPctOfRevenue: finance.cogsPctOfRevenue,
    cogsGhs: finance.cogsGhs,
    grossProfit: finance.grossProfit,
    grossMarginPct,
    marketingSpendGhs: finance.marketingSpendGhs,
    fixedOpexPeriodGhs: finance.fixedOpexPeriodGhs,
    netProfit: finance.netProfit,
    netMarginPct,
    b2bOutstandingGhs: finance.b2bOutstandingGhs,
    paymentSplit: finance.paymentSplit
      .filter((p) => p.revenue > 0)
      .slice(0, 6)
      .map((p) => ({
        method: p.label,
        orders: p.orders,
        revenueGhs: p.revenue,
      })),
  }
}

function summarizeProductPerformance(
  payload: Awaited<ReturnType<typeof computeProductPerformance>>,
  windowLabel: string,
) {
  return {
    windowLabel,
    highlights: payload.highlights,
    topProducts: payload.rows
      .filter((r) => r.revenue7d > 0)
      .slice(0, 8)
      .map((r) => ({
        name: r.name,
        sku: r.sku,
        units: r.units7d,
        revenueGhs: r.revenue7d,
        wowRevenuePercent: r.wowRevenuePercent,
      })),
  }
}

function summarizeSfProductPerformance(
  payload: Awaited<ReturnType<typeof computeSfProductPerformance>>,
  windowLabel: string,
) {
  return {
    windowLabel,
    highlights: payload.highlights,
    topProducts: payload.rows
      .filter((r) => r.revenue7d > 0)
      .slice(0, 8)
      .map((r) => ({
        name: r.name,
        sku: r.sku,
        units: r.units7d,
        revenueGhs: r.revenue7d,
        wowRevenuePercent: r.wowRevenuePercent,
      })),
  }
}

function summarizeMarketing(
  payload: Awaited<ReturnType<typeof computeMarketingAttribution>>,
) {
  return {
    periodDays: payload.periodDays,
    totalSpendGhs: payload.totalSpend,
    totalAttributedGhs: payload.totalAttributed,
    blendedRoas: payload.blendedRoas,
    channels: payload.rows
      .filter((r) => r.spend > 0 || r.attributed > 0)
      .map((r) => ({
        channel: r.label,
        spendGhs: r.spend,
        attributedGhs: r.attributed,
        roas: r.roas,
      })),
  }
}

function summarizeB2bPayments(kpis: ReturnType<typeof computeInvoiceKpis>, scope: string) {
  return {
    scope,
    invoicedGhs: kpis.invoicedGhs,
    paidGhs: kpis.paidGhs,
    outstandingGhs: kpis.outstandingGhs,
    overdueGhs: kpis.overdueGhs,
    collectionRatePct: kpis.collectionRatePct,
    totalInvoices: kpis.totalInvoices,
  }
}

function summarizeRepTargets(
  month: SfTargetMonthKey,
  rows: SfRepTargetWithActuals[],
  mtd: Awaited<ReturnType<typeof computeSfTargetsMtdSummary>>,
) {
  const withSellInTarget = rows.filter((r) => r.targetSellInGhs > 0)
  const below70SellIn = withSellInTarget.filter(
    (r) => (r.sellInAttainmentPct ?? 0) < 70,
  ).length
  const teamTargetSellIn = rows.reduce((s, r) => s + r.targetSellInGhs, 0)
  const teamActualSellIn = rows.reduce((s, r) => s + r.actualSellInMtdGhs, 0)
  const teamTargetVisits = rows.reduce((s, r) => s + r.targetVisits, 0)
  const teamActualVisits = rows.reduce((s, r) => s + r.actualVisitsMtd, 0)
  const topBySellIn = [...rows]
    .sort((a, b) => b.actualSellInMtdGhs - a.actualSellInMtdGhs)
    .slice(0, 8)
    .map((r) => ({
      repName: r.repName,
      actualSellInMtdGhs: r.actualSellInMtdGhs,
      targetSellInGhs: r.targetSellInGhs,
      sellInAttainmentPct: r.sellInAttainmentPct,
      actualVisitsMtd: r.actualVisitsMtd,
      targetVisits: r.targetVisits,
    }))
  return {
    month,
    mtdSummary: mtd,
    repCount: rows.length,
    teamTargetSellInGhs: teamTargetSellIn,
    teamActualSellInGhs: teamActualSellIn,
    teamSellInAttainmentPct:
      teamTargetSellIn > 0
        ? Math.round((teamActualSellIn / teamTargetSellIn) * 1000) / 10
        : null,
    teamTargetVisits,
    teamActualVisits,
    repsBelow70PctSellIn: below70SellIn,
    topRepsBySellIn: topBySellIn,
  }
}

function summarizeLeaderboard(
  snapshot: Awaited<ReturnType<typeof computeSfLeaderboard>>,
) {
  return {
    range: snapshot.range,
    metric: snapshot.metric,
    topReps: snapshot.items.slice(0, 10).map((r) => ({
      rep: r.rep,
      visits: r.visits,
      outletsVisited: r.outletsVisited,
      sellInGhs: r.sellInGhs,
    })),
  }
}

function summarizeRetailCustomers(
  payload: Awaited<ReturnType<typeof computeRetailCustomerIntelligence>>,
) {
  const { rows, segments } = payload
  const withBalance = rows.filter((r) => r.balanceGhs > 0)
  const countBalanceAboveGhs: Record<string, number> = {}
  const outletsAboveBalanceGhs: Record<
    string,
    Array<{
      outletName: string
      balanceGhs: number
      segment: string
      lastInvoiceAt: string
    }>
  > = {}
  for (const threshold of CUSTOMER_BALANCE_THRESHOLDS_GHS) {
    const key = String(threshold)
    const matched = rows
      .filter((r) => r.balanceGhs > threshold)
      .sort((a, b) => b.balanceGhs - a.balanceGhs)
    countBalanceAboveGhs[key] = matched.length
    outletsAboveBalanceGhs[key] = matched.slice(0, 100).map((r) => ({
      outletName: r.outletName,
      balanceGhs: r.balanceGhs,
      segment: r.segment,
      lastInvoiceAt: r.lastInvoiceAt,
    }))
  }
  const totalBalanceGhs = withBalance.reduce((sum, r) => sum + r.balanceGhs, 0)
  const avgBalanceGhs =
    withBalance.length > 0 ? Math.round((totalBalanceGhs / withBalance.length) * 100) / 100 : 0
  const atRiskWithBalance = rows
    .filter((r) => r.segment === 'At risk' && r.balanceGhs > 0)
    .sort((a, b) => b.balanceGhs - a.balanceGhs)
    .slice(0, 8)
    .map((r) => ({
      outletName: r.outletName,
      balanceGhs: r.balanceGhs,
      lastInvoiceAt: r.lastInvoiceAt,
    }))
  const topBalances = [...withBalance]
    .sort((a, b) => b.balanceGhs - a.balanceGhs)
    .slice(0, 10)
    .map((r) => ({
      outletName: r.outletName,
      balanceGhs: r.balanceGhs,
      invoicedNetGhs: r.invoicedNetGhs,
      paidGhs: r.paidGhs,
      segment: r.segment,
    }))

  return {
    scope: 'All-time retail outlets from SF B2B invoices (invoiced net minus paid)',
    totalOutlets: rows.length,
    outletsWithBalance: withBalance.length,
    totalBalanceGhs,
    avgBalanceGhs,
    countBalanceAboveGhs,
    outletsAboveBalanceGhs,
    segments,
    atRiskWithBalance,
    topBalances,
  }
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
    teamTasks: null,
  }

  const jobs: Promise<void>[] = []

  if (access.sections.has('dtc') || access.sections.has('master')) {
    jobs.push(
      (async () => {
        const [dashboard, inventoryRows, financeResult, marketing, productPerf] =
          await Promise.all([
            computeDtcDashboardSnapshot(db, 0),
            listDtcInventory(db),
            computeFinanceLayerSnapshot(db, financeDays),
            computeMarketingAttribution(db, financeDays),
            computeProductPerformance(db),
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
          marketing: summarizeMarketing(marketing),
          productPerformance: summarizeProductPerformance(productPerf, 'Last 7d vs prior 7d'),
        }
        context.finance = summarizeFinanceForAi(finance)
      })(),
    )
  }

  if (access.sections.has('retail') || access.sections.has('master')) {
    jobs.push(
      (async () => {
        const month = currentMonthKey(now)
        const lbRange = defaultSfLeaderboardRange(now)
        const [
          sfDashboard,
          sfInventory,
          invoicesAll,
          customerIntel,
          leaderboard,
          targetsWithActuals,
          targetsMtd,
          sfProductPerf,
        ] = await Promise.all([
          computeSfDashboardSnapshot(db, { rangeStart, rangeEnd: now }),
          listSfInventoryWithOrderVelocity(db),
          listSfB2bInvoices(db),
          computeRetailCustomerIntelligence(db),
          computeSfLeaderboard(db, { ...lbRange, metric: 'sellIn' }),
          computeSfTargetsWithActuals(db, month),
          computeSfTargetsMtdSummary(db, month),
          computeSfProductPerformance(db),
        ])
        const since30 = subDays(now, 30)
        const invoices30d = invoicesAll.filter((r) => {
          const d = sfB2bInvoiceEffectiveDate(r)
          return d && !Number.isNaN(d.getTime()) && d >= since30 && d <= now
        })
        const b2bKpis = computeInvoiceKpis(invoices30d, now)
        const b2bKpisAllTime = computeInvoiceKpis(invoicesAll, now)
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
          b2bPayments30d: summarizeB2bPayments(b2bKpis, 'Last 30 days'),
          b2bPaymentsAllTime: summarizeB2bPayments(b2bKpisAllTime, 'All invoices on file'),
          customerIntelligence: summarizeRetailCustomers(customerIntel),
          repTargets: summarizeRepTargets(month, targetsWithActuals, targetsMtd),
          leaderboard30d: summarizeLeaderboard(leaderboard),
          productPerformance: summarizeSfProductPerformance(
            sfProductPerf,
            'Last 7d vs prior 7d (SF orders + B2B invoices)',
          ),
        }
      })(),
    )
  }

  if (access.sections.has('master')) {
    jobs.push(
      (async () => {
        const rows = await db
          .collection<RepTaskDoc>(REP_TASKS_COLLECTION)
          .find({ status: { $nin: ['done'] } })
          .sort({ updatedAt: -1 })
          .limit(20)
          .toArray()
        context.teamTasks = rows.map((r) => {
          const t = serializeRepTask(r as RepTaskDoc)
          return {
            repName: t.repName,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueAt: t.dueAt,
          }
        })
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

function parseBalanceThresholdForPrompt(text: string): number | null {
  const t = text.toLowerCase()
  if (!/(balance|outstanding|receivable|owe|debt|collect|outlet)/i.test(t)) return null
  const kMatch = t.match(/(\d+(?:\.\d+)?)\s*k\b/)
  if (kMatch) {
    const n = parseFloat(kMatch[1])
    return Number.isFinite(n) ? Math.round(n * 1000) : null
  }
  const m =
    t.match(/(?:above|over|more than|>)\s*(?:ghs\s*)?([\d,]+)/i) ??
    t.match(/([\d,]+)\s*ghs/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Compact context for the LLM — full context stays in memory for snapshots / outlet injection. */
export function formatAiDashboardContextForPrompt(
  context: AiDashboardContext,
  userMessage?: string,
): string {
  const retail = context.retail as Record<string, unknown> | null
  const ci = retail?.customerIntelligence as Record<string, unknown> | undefined
  const balanceThreshold = userMessage ? parseBalanceThresholdForPrompt(userMessage) : null

  let customerIntelligence: Record<string, unknown> | undefined
  if (ci) {
    const { outletsAboveBalanceGhs: _omit, ...ciRest } = ci
    customerIntelligence = { ...ciRest }

    if (balanceThreshold !== null) {
      const lists = ci.outletsAboveBalanceGhs as Record<string, unknown[]> | undefined
      const key = String(balanceThreshold)
      const exact = lists?.[key]
      const fallbackKey = Object.keys(lists ?? {})
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .filter((n) => n <= balanceThreshold)
        .pop()
      const rows = (exact ?? (fallbackKey != null ? lists?.[String(fallbackKey)] : [])) as
        | Array<Record<string, unknown>>
        | undefined
      customerIntelligence.outletsForQuestion = (rows ?? [])
        .filter((r) => Number(r.balanceGhs) > balanceThreshold)
        .slice(0, 25)
        .map((r) => ({
          outletName: r.outletName,
          balanceGhs: r.balanceGhs,
        }))
    }
  }

  const compactRetail = retail
    ? {
        dashboard: (() => {
          const dash = retail.dashboard as Record<string, unknown> | undefined
          if (!dash) return dash
          return {
            rangeStart: dash.rangeStart,
            rangeEnd: dash.rangeEnd,
            primaryRegionLabel: dash.primaryRegionLabel,
            kpis: dash.kpis,
            repPulse: Array.isArray(dash.repPulse) ? dash.repPulse.slice(0, 5) : dash.repPulse,
            alerts: Array.isArray(dash.alerts) ? dash.alerts.slice(0, 5) : dash.alerts,
          }
        })(),
        inventory: retail.inventory,
        b2bPayments30d: retail.b2bPayments30d,
        b2bPaymentsAllTime: retail.b2bPaymentsAllTime,
        customerIntelligence,
        repTargets: (() => {
          const rt = retail.repTargets as Record<string, unknown> | undefined
          if (!rt) return rt
          return {
            month: rt.month,
            mtdSummary: rt.mtdSummary,
            repCount: rt.repCount,
            teamTargetSellInGhs: rt.teamTargetSellInGhs,
            teamActualSellInGhs: rt.teamActualSellInGhs,
            teamSellInAttainmentPct: rt.teamSellInAttainmentPct,
            repsBelow70PctSellIn: rt.repsBelow70PctSellIn,
            topRepsBySellIn: Array.isArray(rt.topRepsBySellIn)
              ? rt.topRepsBySellIn.slice(0, 5)
              : rt.topRepsBySellIn,
          }
        })(),
        leaderboard30d: (() => {
          const lb = retail.leaderboard30d as Record<string, unknown> | undefined
          if (!lb) return lb
          return {
            range: lb.range,
            metric: lb.metric,
            topReps: Array.isArray(lb.topReps) ? lb.topReps.slice(0, 5) : lb.topReps,
          }
        })(),
        productPerformance: (() => {
          const pp = retail.productPerformance as Record<string, unknown> | undefined
          if (!pp) return pp
          return {
            windowLabel: pp.windowLabel,
            highlights: pp.highlights,
            topProducts: Array.isArray(pp.topProducts) ? pp.topProducts.slice(0, 5) : pp.topProducts,
          }
        })(),
      }
    : null

  const dtc = context.dtc as Record<string, unknown> | null
  const compactDtc = dtc
    ? {
        dashboard: (() => {
          const dash = dtc.dashboard as Record<string, unknown> | undefined
          if (!dash) return dash
          return {
            kpis: dash.kpis,
            topSkus: Array.isArray(dash.topSkus) ? dash.topSkus.slice(0, 5) : dash.topSkus,
            alerts: Array.isArray(dash.alerts) ? dash.alerts.slice(0, 5) : dash.alerts,
            period: dash.period,
          }
        })(),
        inventory: (() => {
          const inv = dtc.inventory as Record<string, unknown> | undefined
          if (!inv) return inv
          return {
            stats: inv.stats,
            critical: inv.critical,
            low: inv.low,
          }
        })(),
        marketing: (() => {
          const m = dtc.marketing as Record<string, unknown> | undefined
          if (!m) return m
          return {
            periodDays: m.periodDays,
            totalSpendGhs: m.totalSpendGhs,
            totalAttributedGhs: m.totalAttributedGhs,
            blendedRoas: m.blendedRoas,
            channels: Array.isArray(m.channels) ? m.channels.slice(0, 6) : m.channels,
          }
        })(),
        productPerformance: (() => {
          const pp = dtc.productPerformance as Record<string, unknown> | undefined
          if (!pp) return pp
          return {
            windowLabel: pp.windowLabel,
            highlights: pp.highlights,
            topProducts: Array.isArray(pp.topProducts) ? pp.topProducts.slice(0, 5) : pp.topProducts,
          }
        })(),
      }
    : null

  const compact = {
    generatedAt: context.generatedAt,
    user: context.user,
    currentPage: context.currentPage,
    finance: context.finance,
    dtc: compactDtc,
    retail: compactRetail,
    tasks: context.tasks?.slice(0, 8) ?? null,
    teamTasks: context.teamTasks?.slice(0, 8) ?? null,
  }

  return JSON.stringify(compact)
}
