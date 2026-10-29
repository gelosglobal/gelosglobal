import type { AppSection, UserAccess } from '@/lib/access'
import { computeDtcDashboardSnapshot } from '@/lib/dtc-dashboard'
import { computeFinanceLayerSnapshot } from '@/lib/dtc-finance'
import {
  computeInventoryStats,
  listDtcInventory,
  serializeInventoryItem,
  type StockHealth,
} from '@/lib/dtc-inventory'
import { computeOrderStats, listDtcOrders, type OrderStatus } from '@/lib/dtc-orders'
import { computeProductPerformance } from '@/lib/dtc-product-performance'
import type { McpUser } from '@/lib/mcp/identity'
import { listRepTasks, serializeRepTask } from '@/lib/rep-tasks'
import { computeSfDashboardSnapshot } from '@/lib/sf-dashboard'
import { computeInvoiceKpis, listSfB2bInvoices } from '@/lib/sf-b2b-invoices'
import { computeRetailCustomerIntelligence, type RetailCustomerSegment } from '@/lib/sf-customer-intelligence'
import { listSfInventoryWithOrderVelocity } from '@/lib/sf-inventory'
import { computeSfLeaderboard, type SfLeaderboardMetric } from '@/lib/sf-leaderboard'
import { computeSfProductPerformance } from '@/lib/sf-product-performance'
import {
  computeShopVisitStats,
  filterShopVisitsByRange,
  listShopVisits,
  serializeShopVisit,
  type SfVisitStatus,
} from '@/lib/sf-shop-visits'
import { computeSfTargetsMtdSummary, computeSfTargetsWithActuals } from '@/lib/sf-targets'
import { listSellInExpensesForMonth, type SellInExpenseCategory } from '@/lib/sell-in-expenses'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { endOfDay, format, startOfDay, subDays } from 'date-fns'
import type { Db } from 'mongodb'
import { z } from 'zod'

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

class ToolInputError extends Error {}

const daysField = (fallback: string) =>
  z.coerce.number().int().min(1).max(3660).optional().describe(fallback)

const limitField = (max: number) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(`How many rows to return. Maximum ${max}.`)

const queryField = (what: string) =>
  z.string().trim().max(80).optional().describe(what)

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.floor(value)))
}

function includesQuery(query: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  const needle = query?.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

function monthKey(month: string | undefined): string {
  const value = month?.trim() || format(new Date(), 'yyyy-MM')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ToolInputError('month must be YYYY-MM.')
  }
  return value
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function failure(err: unknown) {
  if (err instanceof ToolInputError) {
    return { isError: true as const, content: [{ type: 'text' as const, text: err.message }] }
  }
  console.error('[mcp] tool failed', err)
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: 'Could not read GELOS data.' }],
  }
}

async function run(fn: () => Promise<unknown>) {
  try {
    return textResult(await fn())
  } catch (err) {
    return failure(err)
  }
}

function productRows(
  rows: Array<{
    name: string
    sku: string | null
    units7d: number
    revenue7d: number
    revenuePrev7d: number
    wowRevenuePercent: number | null
    isNew: boolean
  }>,
  limit: number,
) {
  return [...rows]
    .sort((a, b) => b.revenue7d - a.revenue7d)
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      sku: row.sku,
      units: row.units7d,
      revenueGhs: row.revenue7d,
      previousRevenueGhs: row.revenuePrev7d,
      wowRevenuePercent: row.wowRevenuePercent,
      isNew: row.isNew,
    }))
}

export function registerGelosTools(
  server: McpServer,
  input: { db: Db; user: McpUser; access: UserAccess },
) {
  const { db, user, access } = input
  const allow = (section: AppSection) => access.sections.has(section)

  server.registerTool(
    'whoami',
    {
      title: 'Who is connected',
      description:
        'Which GELOS user this connection is, and which sections they can read. Amounts in every tool are Ghana cedis (GHS). Tools are read-only.',
      annotations: readOnly,
    },
    async () =>
      textResult({
        email: user.email,
        name: user.name,
        sections: [...access.sections],
        currency: 'GHS',
        access: 'Read-only. Call only the tools listed for this connection.',
      }),
  )

  if (allow('dtc')) {
    server.registerTool(
      'get_dtc_dashboard',
      {
        title: 'DTC dashboard',
        description:
          'DTC KPIs for a recent period: orders, units, revenue, average order value, fulfillment queue, SKU count, stock below safety, top SKUs, and alerts. Amounts are GHS.',
        inputSchema: {
          periodDays: daysField('Days of orders to include. Defaults to 30.'),
        },
        annotations: readOnly,
      },
      async ({ periodDays }) =>
        run(async () => computeDtcDashboardSnapshot(db, clamp(periodDays, 30, 3660))),
    )

    server.registerTool(
      'get_dtc_inventory',
      {
        title: 'DTC inventory',
        description:
          'DTC stock by SKU: on hand, safety stock, days of cover, health (ok, low, critical), and in-transit value in GHS. Use health below_safety for anything under safety stock.',
        inputSchema: {
          health: z
            .enum(['ok', 'low', 'critical', 'below_safety'])
            .optional()
            .describe('Filter by stock health.'),
          query: queryField('Match SKU or product name.'),
          limit: limitField(40),
        },
        annotations: readOnly,
      },
      async ({ health, query, limit }) =>
        run(async () => {
          const docs = await listDtcInventory(db)
          const items = docs.map(serializeInventoryItem)
          const matched = items.filter((item) => {
            if (!includesQuery(query, item.sku, item.name, item.warehouse)) return false
            if (!health) return true
            if (health === 'below_safety') return item.onHand < item.safetyStock
            return item.health === (health as StockHealth)
          })
          const take = clamp(limit, 25, 40)
          return {
            generatedAt: new Date().toISOString(),
            stats: computeInventoryStats(docs),
            matched: matched.length,
            items: matched.slice(0, take).map((item) => ({
              sku: item.sku,
              name: item.name,
              warehouse: item.warehouse,
              onHand: item.onHand,
              safetyStock: item.safetyStock,
              daysCover: item.daysCover,
              health: item.health,
              priceGhs: item.priceGhs,
              inTransitValue: item.inTransitValue,
            })),
          }
        }),
    )

    server.registerTool(
      'get_dtc_orders',
      {
        title: 'DTC orders',
        description:
          'Recent DTC orders and order stats. Customer phone and email are omitted. Amounts are GHS.',
        inputSchema: {
          status: z
            .enum(['fulfilled', 'processing', 'pending_payment'])
            .optional()
            .describe('Filter by order status.'),
          query: queryField('Match customer, order number, or channel.'),
          limit: limitField(20),
        },
        annotations: readOnly,
      },
      async ({ status, query, limit }) =>
        run(async () => {
          const orders = await listDtcOrders(db)
          const matched = orders.filter((order) => {
            if (status && order.status !== (status as OrderStatus)) return false
            return includesQuery(query, order.customer, order.orderNumber, order.channel, order.customerLocation)
          })
          const take = clamp(limit, 15, 20)
          return {
            generatedAt: new Date().toISOString(),
            stats: computeOrderStats(orders),
            matched: matched.length,
            orders: matched.slice(0, take).map((order) => ({
              orderNumber: order.orderNumber,
              customer: order.customer,
              customerLocation: order.customerLocation ?? null,
              channel: order.channel,
              paymentMethod: order.paymentMethod,
              status: order.status,
              totalAmount: order.totalAmount,
              discountGhs: order.discountGhs ?? 0,
              orderedAt: iso(order.orderedAt),
              items: (order.items ?? []).slice(0, 12).map((item) => ({
                sku: item.sku ?? null,
                name: item.name,
                qty: item.qty,
                unitPrice: item.unitPrice,
              })),
            })),
          }
        }),
    )

    server.registerTool(
      'get_dtc_product_performance',
      {
        title: 'DTC product performance',
        description:
          'DTC products for a window versus the previous window of the same length. Includes revenue, units, week-on-week change, and new products. Amounts are GHS.',
        inputSchema: {
          days: daysField('Length of the current window. Defaults to 7. The previous window is the same length.'),
          limit: limitField(15),
        },
        annotations: readOnly,
      },
      async ({ days, limit }) =>
        run(async () => {
          const windowDays = clamp(days, 7, 366)
          const currentEnd = new Date()
          const currentStart = subDays(currentEnd, windowDays)
          const result = await computeProductPerformance(db, { currentStart, currentEnd })
          return {
            generatedAt: currentEnd.toISOString(),
            windowDays,
            highlights: result.highlights,
            topProducts: productRows(result.rows, clamp(limit, 10, 15)),
          }
        }),
    )

    server.registerTool(
      'get_finance_snapshot',
      {
        title: 'Finance snapshot',
        description:
          'GELOS finance for a period: DTC collected revenue, B2B invoice revenue and collections, total revenue, COGS, gross profit, marketing spend, operating expenses, net profit, and B2B outstanding. Amounts are GHS.',
        inputSchema: {
          periodDays: daysField('Days to include. Defaults to 30.'),
        },
        annotations: readOnly,
      },
      async ({ periodDays }) =>
        run(async () => {
          const { snapshot } = await computeFinanceLayerSnapshot(db, clamp(periodDays, 30, 3660))
          return snapshot
        }),
    )
  }

  if (allow('retail')) {
    server.registerTool(
      'get_retail_dashboard',
      {
        title: 'Retail dashboard',
        description:
          'Retail field-sales KPIs: active outlets, visits, B2B sell-in, collections, month-to-date progress, open POSM tasks, upcoming visits, and rep activity. Amounts are GHS.',
        inputSchema: {
          days: daysField('Days of visits and sell-in to include. Defaults to 7. Month-to-date figures stay month-to-date.'),
        },
        annotations: readOnly,
      },
      async ({ days }) =>
        run(async () => {
          const rangeEnd = new Date()
          const rangeStart = subDays(rangeEnd, clamp(days, 7, 366))
          const snapshot = await computeSfDashboardSnapshot(db, { rangeStart, rangeEnd })
          return { ...snapshot, repPulse: snapshot.repPulse.slice(0, 12) }
        }),
    )

    server.registerTool(
      'get_retail_inventory',
      {
        title: 'Retail inventory',
        description:
          'Retail stock by SKU with days of cover from the last 30 days of outlet orders. Health is ok, low, or critical. Amounts are GHS.',
        inputSchema: {
          health: z
            .enum(['ok', 'low', 'critical', 'below_safety'])
            .optional()
            .describe('Filter by stock health.'),
          query: queryField('Match SKU or product name.'),
          limit: limitField(40),
        },
        annotations: readOnly,
      },
      async ({ health, query, limit }) =>
        run(async () => {
          const payload = await listSfInventoryWithOrderVelocity(db)
          const matched = payload.items.filter((item) => {
            if (!includesQuery(query, item.sku, item.name, item.repName)) return false
            if (!health) return true
            if (health === 'below_safety') return item.onHand < item.safetyStock
            return item.health === health
          })
          return {
            generatedAt: new Date().toISOString(),
            stats: payload.stats,
            matched: matched.length,
            items: matched.slice(0, clamp(limit, 25, 40)).map((item) => ({
              sku: item.sku,
              name: item.name,
              repName: item.repName ?? null,
              onHand: item.onHand,
              safetyStock: item.safetyStock,
              daysCover: item.daysCover,
              health: item.health,
              priceGhs: item.priceGhs,
            })),
          }
        }),
    )

    server.registerTool(
      'get_retail_invoices',
      {
        title: 'Retail B2B invoices',
        description:
          'B2B invoice KPIs (invoiced, paid, outstanding, overdue, collection rate) and matching invoices. Amounts are GHS.',
        inputSchema: {
          query: queryField('Match outlet name, invoice number, or rep.'),
          onlyOutstanding: z.boolean().optional().describe('When true, only invoices with a balance.'),
          limit: limitField(20),
        },
        annotations: readOnly,
      },
      async ({ query, onlyOutstanding, limit }) =>
        run(async () => {
          const now = new Date()
          const rows = await listSfB2bInvoices(db)
          const kpis = computeInvoiceKpis(rows, now)
          const detailed = rows.map((row) => {
            const discount = Math.max(0, Math.min(row.amountGhs, row.discountGhs ?? 0))
            const net = Math.max(0, row.amountGhs - discount)
            const balance = Math.max(0, net - (Number(row.paidGhs) || 0))
            const due = row.dueAt instanceof Date ? row.dueAt : null
            const overdue = balance > 0 && due != null && due.getTime() < now.getTime()
            return {
              outletName: row.outletName,
              invoiceNumber: row.invoiceNumber,
              repName: row.repName ?? null,
              netGhs: net,
              paidGhs: Number(row.paidGhs) || 0,
              balanceGhs: balance,
              status: balance <= 0 ? 'paid' : overdue ? 'overdue' : 'open',
              invoiceAt: iso(row.invoiceAt ?? row.createdAt),
              dueAt: iso(row.dueAt),
              items: (row.items ?? []).slice(0, 8).map((item) => ({
                name: item.name,
                sku: item.sku ?? null,
                qty: item.qty,
                unitPriceGhs: item.unitPriceGhs,
              })),
            }
          })
          const matched = detailed.filter((row) => {
            if (onlyOutstanding && row.balanceGhs <= 0) return false
            return includesQuery(query, row.outletName, row.invoiceNumber, row.repName)
          })
          matched.sort((a, b) => {
            if (onlyOutstanding) return b.balanceGhs - a.balanceGhs
            return (b.invoiceAt ?? '').localeCompare(a.invoiceAt ?? '')
          })
          return {
            generatedAt: now.toISOString(),
            kpis,
            matched: matched.length,
            invoices: matched.slice(0, clamp(limit, 15, 20)),
          }
        }),
    )

    server.registerTool(
      'get_retail_customers',
      {
        title: 'Retail customers',
        description:
          'Retail outlet balances and segments (High value, At risk, New (30d), Core) from B2B invoices. Amounts are GHS.',
        inputSchema: {
          segment: z
            .enum(['High value', 'At risk', 'New (30d)', 'Core'])
            .optional()
            .describe('Filter by segment.'),
          query: queryField('Match outlet name.'),
          minBalanceGhs: z.coerce
            .number()
            .min(0)
            .optional()
            .describe('Only outlets whose balance is at least this many GHS.'),
          limit: limitField(30),
        },
        annotations: readOnly,
      },
      async ({ segment, query, minBalanceGhs, limit }) =>
        run(async () => {
          const result = await computeRetailCustomerIntelligence(db)
          const matched = result.rows.filter((row) => {
            if (segment && row.segment !== (segment as RetailCustomerSegment)) return false
            if (!includesQuery(query, row.outletName)) return false
            if (minBalanceGhs != null && row.balanceGhs < minBalanceGhs) return false
            return true
          })
          const ranked =
            minBalanceGhs != null
              ? [...matched].sort((a, b) => b.balanceGhs - a.balanceGhs)
              : matched
          return {
            generatedAt: new Date().toISOString(),
            segments: result.segments,
            totalOutlets: result.rows.length,
            matched: matched.length,
            totalBalanceGhs: matched.reduce((sum, row) => sum + row.balanceGhs, 0),
            outlets: ranked.slice(0, clamp(limit, 20, 30)).map((row) => ({
              outletName: row.outletName,
              segment: row.segment,
              invoices: row.invoices,
              invoicedNetGhs: row.invoicedNetGhs,
              paidGhs: row.paidGhs,
              balanceGhs: row.balanceGhs,
              lastInvoiceAt: row.lastInvoiceAt,
            })),
          }
        }),
    )

    server.registerTool(
      'get_retail_shop_visits',
      {
        title: 'Shop visits',
        description:
          'Retail shop visits: scheduled, completed, and cancelled counts, sell-in, and recent visits. Amounts are GHS.',
        inputSchema: {
          status: z
            .enum(['scheduled', 'completed', 'cancelled'])
            .optional()
            .describe('Filter by visit status.'),
          days: daysField('How many days back to include. Defaults to 30.'),
          query: queryField('Match outlet, area, or rep.'),
          limit: limitField(25),
        },
        annotations: readOnly,
      },
      async ({ status, days, query, limit }) =>
        run(async () => {
          const windowDays = clamp(days, 30, 366)
          const end = endOfDay(new Date())
          const start = startOfDay(subDays(end, windowDays - 1))
          const rows = await listShopVisits(db, status ? { status: status as SfVisitStatus } : undefined)
          const inRange = filterShopVisitsByRange(rows, { start, end }).filter((row) =>
            includesQuery(query, row.outletName, row.area, row.repName),
          )
          return {
            generatedAt: new Date().toISOString(),
            range: { from: start.toISOString(), to: end.toISOString() },
            stats: computeShopVisitStats(inRange),
            visits: inRange.slice(0, clamp(limit, 15, 25)).map((row) => {
              const json = serializeShopVisit(row)
              return {
                outletName: json.outletName,
                area: json.area,
                repName: json.repName,
                status: json.status,
                visitType: json.visitType,
                scheduledAt: json.scheduledAt,
                visitedAt: json.visitedAt,
                sellInGhs: json.sellInGhs,
                notes: json.notes ? json.notes.slice(0, 180) : null,
              }
            }),
          }
        }),
    )

    server.registerTool(
      'get_retail_targets',
      {
        title: 'Retail targets',
        description:
          'Rep targets versus month-to-date actuals for visits, sell-in, and POSM. Month is YYYY-MM and defaults to the current month. Amounts are GHS.',
        inputSchema: {
          month: z.string().trim().optional().describe('Month as YYYY-MM. Defaults to the current month.'),
        },
        annotations: readOnly,
      },
      async ({ month }) =>
        run(async () => {
          const key = monthKey(month)
          const [reps, summary] = await Promise.all([
            computeSfTargetsWithActuals(db, key),
            computeSfTargetsMtdSummary(db, key),
          ])
          return {
            month: key,
            summary,
            reps: reps
              .map((rep) => ({
                repName: rep.repName,
                region: rep.region,
                targetVisits: rep.targetVisits,
                actualVisitsMtd: rep.actualVisitsMtd,
                visitsAttainmentPct: rep.visitsAttainmentPct,
                targetSellInGhs: rep.targetSellInGhs,
                actualSellInMtdGhs: rep.actualSellInMtdGhs,
                sellInAttainmentPct: rep.sellInAttainmentPct,
                targetPosmTasks: rep.targetPosmTasks,
                actualPosmDoneMtd: rep.actualPosmDoneMtd,
                posmAttainmentPct: rep.posmAttainmentPct,
                newShopsAcquiredMtd: rep.newShopsAcquiredMtd,
              }))
              .sort((a, b) => b.actualSellInMtdGhs - a.actualSellInMtdGhs),
          }
        }),
    )

    server.registerTool(
      'get_retail_leaderboard',
      {
        title: 'Retail leaderboard',
        description:
          'Rep leaderboard from completed shop visits. Metric is sellIn, visits, or outlets. Amounts are GHS.',
        inputSchema: {
          days: daysField('How many days to include, ending today. Defaults to 30.'),
          metric: z
            .enum(['sellIn', 'visits', 'outlets'])
            .optional()
            .describe('Sort metric. Defaults to sellIn.'),
          limit: limitField(20),
        },
        annotations: readOnly,
      },
      async ({ days, metric, limit }) =>
        run(async () => {
          const windowDays = clamp(days, 30, 366)
          const to = startOfDay(new Date())
          const from = startOfDay(subDays(to, windowDays - 1))
          const snapshot = await computeSfLeaderboard(db, {
            from,
            to,
            metric: (metric ?? 'sellIn') as SfLeaderboardMetric,
          })
          return {
            ...snapshot,
            totalReps: snapshot.items.length,
            items: snapshot.items.slice(0, clamp(limit, 15, 20)),
          }
        }),
    )

    server.registerTool(
      'get_retail_product_performance',
      {
        title: 'Retail product performance',
        description:
          'Retail sell-out by product for a window versus the previous window, using outlet orders and B2B invoice lines. Amounts are GHS.',
        inputSchema: {
          days: daysField('Length of the current window. Defaults to 7.'),
          limit: limitField(15),
        },
        annotations: readOnly,
      },
      async ({ days, limit }) =>
        run(async () => {
          const windowDays = clamp(days, 7, 366)
          const currentEnd = new Date()
          const currentStart = subDays(currentEnd, windowDays)
          const result = await computeSfProductPerformance(db, { currentStart, currentEnd })
          return {
            generatedAt: currentEnd.toISOString(),
            windowDays,
            highlights: result.highlights,
            topProducts: productRows(result.rows, clamp(limit, 10, 15)),
          }
        }),
    )
  }

  if (allow('sell-in')) {
    server.registerTool(
      'get_sell_in_expenses',
      {
        title: 'Sell-in expenses',
        description:
          'Sell-in expenses for a month: total, totals by category, and recent rows. Month is YYYY-MM. Amounts are GHS.',
        inputSchema: {
          month: z.string().trim().optional().describe('Month as YYYY-MM. Defaults to the current month.'),
          limit: limitField(25),
        },
        annotations: readOnly,
      },
      async ({ month, limit }) =>
        run(async () => {
          const key = monthKey(month)
          const rows = await listSellInExpensesForMonth(db, key)
          const byCategory: Record<string, number> = {}
          for (const row of rows) {
            const category = row.category as SellInExpenseCategory
            byCategory[category] = (byCategory[category] ?? 0) + row.amountGhs
          }
          return {
            month: key,
            count: rows.length,
            totalGhs: rows.reduce((sum, row) => sum + row.amountGhs, 0),
            byCategory,
            expenses: rows.slice(0, clamp(limit, 15, 25)).map((row) => ({
              occurredAt: iso(row.occurredAt),
              amountGhs: row.amountGhs,
              category: row.category,
              description: row.description.slice(0, 160),
              accountName: row.accountName ?? null,
              status: row.status ?? null,
              paymentMethod: row.paymentMethod ?? null,
            })),
          }
        }),
    )
  }

  if (allow('master')) {
    server.registerTool(
      'list_rep_tasks',
      {
        title: 'Rep tasks',
        description: 'Rep tasks across the team, with counts by status. Master access only.',
        inputSchema: {
          status: z
            .enum(['started', 'in_progress', 'done'])
            .optional()
            .describe('Filter by status. Older open tasks appear as started.'),
          query: queryField('Match rep name or task title.'),
          limit: limitField(30),
        },
        annotations: readOnly,
      },
      async ({ status, query, limit }) =>
        run(async () => {
          const tasks = (await listRepTasks(db)).map(serializeRepTask)
          const counts = {
            started: tasks.filter((task) => task.status === 'started').length,
            in_progress: tasks.filter((task) => task.status === 'in_progress').length,
            done: tasks.filter((task) => task.status === 'done').length,
          }
          const matched = tasks.filter((task) => {
            if (status && task.status !== status) return false
            return includesQuery(query, task.repName, task.title)
          })
          return {
            generatedAt: new Date().toISOString(),
            counts,
            matched: matched.length,
            tasks: matched.slice(0, clamp(limit, 20, 30)).map((task) => ({
              repName: task.repName,
              title: task.title,
              status: task.status,
              priority: task.priority,
              dueAt: task.dueAt,
              notes: task.notes ? task.notes.slice(0, 160) : null,
            })),
          }
        }),
    )
  }
}
