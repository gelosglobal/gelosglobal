import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { subDays } from 'date-fns'
import { spendByChannelFromCampaigns } from '@/lib/dtc-marketing-campaigns'
import {
  DTC_ORDERS_COLLECTION,
  type PaymentMethod,
} from '@/lib/dtc-orders'
import { DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION } from '@/lib/dtc-customer-intelligence-ledger'
import { SF_B2B_INVOICES_COLLECTION } from '@/lib/sf-b2b-invoices'

export const FINANCE_LAYER_CONFIG_COLLECTION = 'finance_layer_config'
export const B2B_CASH_COLLECTIONS_COLLECTION = 'b2b_cash_collections'

export const FINANCE_CONFIG_ID = 'default'

export type FinanceLayerConfigDoc = {
  _id: string
  b2bOutstandingGhs: number
  /** COGS as a share of revenue (0–1). Gross profit = revenue × (1 − cogs). */
  cogsPctOfRevenue: number
  /** Operating expenses attributed to the reporting window (GHS). */
  fixedOpexPeriodGhs: number
  updatedAt: Date
}

export type B2BCashCollectionDoc = {
  _id: ObjectId
  amountGhs: number
  collectedAt: Date
  note?: string
  /** Trade outlet / customer name (optional; SF B2B payments). */
  outletName?: string
  /** Field rep who logged the collection (optional). */
  repName?: string
  createdAt: Date
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo: 'Mobile money',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  pay_on_delivery: 'Pay on delivery',
}

const PAYMENT_METHODS_ORDER: PaymentMethod[] = [
  'momo',
  'cash',
  'card',
  'bank_transfer',
  'pay_on_delivery',
]

function configCollection(db: Db) {
  return db.collection<FinanceLayerConfigDoc>(FINANCE_LAYER_CONFIG_COLLECTION)
}

function b2bCashCollection(db: Db) {
  return db.collection<WithoutId<B2BCashCollectionDoc>>(
    B2B_CASH_COLLECTIONS_COLLECTION,
  )
}

export async function getOrCreateFinanceConfig(db: Db): Promise<FinanceLayerConfigDoc> {
  const now = new Date()
  const existing = await configCollection(db).findOne({ _id: FINANCE_CONFIG_ID })
  if (existing) return existing
  const doc: FinanceLayerConfigDoc = {
    _id: FINANCE_CONFIG_ID,
    b2bOutstandingGhs: 0,
    cogsPctOfRevenue: 0.42,
    fixedOpexPeriodGhs: 0,
    updatedAt: now,
  }
  await configCollection(db).insertOne(doc)
  return doc
}

export type FinanceLayerConfigUpdate = Partial<{
  b2bOutstandingGhs: number
  cogsPctOfRevenue: number
  fixedOpexPeriodGhs: number
}>

export async function updateFinanceConfig(
  db: Db,
  patch: FinanceLayerConfigUpdate,
): Promise<FinanceLayerConfigDoc> {
  await getOrCreateFinanceConfig(db)
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.b2bOutstandingGhs !== undefined) {
    $set.b2bOutstandingGhs = Math.max(0, patch.b2bOutstandingGhs)
  }
  if (patch.cogsPctOfRevenue !== undefined) {
    $set.cogsPctOfRevenue = Math.min(1, Math.max(0, patch.cogsPctOfRevenue))
  }
  if (patch.fixedOpexPeriodGhs !== undefined) {
    $set.fixedOpexPeriodGhs = Math.max(0, patch.fixedOpexPeriodGhs)
  }
  const res = await configCollection(db).findOneAndUpdate(
    { _id: FINANCE_CONFIG_ID },
    { $set },
    { returnDocument: 'after', upsert: false },
  )
  return (res as FinanceLayerConfigDoc) ?? (await getOrCreateFinanceConfig(db))
}

export async function sumB2BCashCollections(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = await b2bCashCollection(db)
    .aggregate<{ total: number }>([
      {
        $match: {
          collectedAt: { $gte: since, $lte: until },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountGhs' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
}

/** B2B portal channel order revenue in the window (sell-in / invoiced via portal). */
export async function sumB2BPortalOrderRevenue(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = await db
    .collection(DTC_ORDERS_COLLECTION)
    .aggregate<{ total: number }>([
      {
        $match: {
          channel: 'B2B portal',
          orderedAt: { $gte: since, $lte: until },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
}

/** Effective invoice date (aligned with B2B Payments). */
export function sfB2bInvoiceEffectiveDate(
  doc: Pick<
    import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc,
    'invoiceAt' | 'dueAt' | 'createdAt'
  >,
): Date {
  const raw = doc.invoiceAt ?? doc.dueAt ?? doc.createdAt
  if (!raw) return new Date(NaN)
  if (raw instanceof Date) return raw
  const d = new Date(raw)
  return d
}

function asDate(raw: Date | string | undefined | null): Date | null {
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function inInclusiveRange(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/**
 * B2B Payments period match: invoice dated in range, or any installment
 * received in range (so “Today” catches payments on older invoices).
 */
export function sfB2bInvoiceMatchesDateRange(
  doc: Pick<
    import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc,
    'invoiceAt' | 'dueAt' | 'createdAt' | 'paidAt' | 'paidGhs' | 'payments'
  >,
  start: Date,
  end: Date,
): boolean {
  const invoiceDate = sfB2bInvoiceEffectiveDate(doc)
  if (invoiceDate && !Number.isNaN(invoiceDate.getTime()) && inInclusiveRange(invoiceDate, start, end)) {
    return true
  }

  const payments = Array.isArray(doc.payments) ? doc.payments : []
  if (payments.length > 0) {
    for (const p of payments) {
      const paidAt = asDate(p.paidAt)
      if (paidAt && inInclusiveRange(paidAt, start, end)) return true
    }
    return false
  }

  if ((Number(doc.paidGhs) || 0) > 0) {
    const paidAt = asDate(doc.paidAt) ?? invoiceDate
    if (paidAt && !Number.isNaN(paidAt.getTime()) && inInclusiveRange(paidAt, start, end)) {
      return true
    }
  }

  return false
}

/** When payment was recorded (for collections in a period). */
export function sfB2bInvoicePaymentDate(
  doc: Pick<
    import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc,
    'paidAt' | 'updatedAt' | 'invoiceAt' | 'createdAt' | 'paidGhs'
  >,
): Date | null {
  if ((Number(doc.paidGhs) || 0) <= 0) return null
  return doc.paidAt ?? doc.updatedAt ?? doc.invoiceAt ?? doc.createdAt ?? null
}

export function sfB2bInvoiceNetAmount(
  doc: Pick<import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc, 'amountGhs' | 'discountGhs'>,
): number {
  const amount = Number(doc.amountGhs) || 0
  const discount = Math.max(0, Math.min(amount, Number(doc.discountGhs) || 0))
  return Math.max(0, amount - discount)
}

export async function sumSfB2bInvoiceRevenue(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = (await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .find({})
    .project({ amountGhs: 1, discountGhs: 1, invoiceAt: 1, dueAt: 1, createdAt: 1 })
    .toArray()) as Pick<
    import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc,
    'amountGhs' | 'discountGhs' | 'invoiceAt' | 'dueAt' | 'createdAt'
  >[]

  let total = 0
  for (const row of rows) {
    const d = sfB2bInvoiceEffectiveDate(row)
    if (!d || d < since || d > until) continue
    total += sfB2bInvoiceNetAmount(row)
  }
  return total
}

export async function sumSfB2bInvoicePaidTotal(db: Db): Promise<number> {
  const rows = await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$paidGhs' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
}

export async function sumSfB2bInvoicePaidInRange(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = (await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .find({ paidGhs: { $gt: 0 } })
    .project({
      paidGhs: 1,
      paidAt: 1,
      payments: 1,
      updatedAt: 1,
      invoiceAt: 1,
      createdAt: 1,
      paymentMethod: 1,
    })
    .toArray()) as Pick<
    import('@/lib/sf-b2b-invoices').SfB2bInvoiceDoc,
    'paidGhs' | 'paidAt' | 'payments' | 'updatedAt' | 'invoiceAt' | 'createdAt' | 'paymentMethod'
  >[]

  let total = 0
  for (const row of rows) {
    const events =
      Array.isArray(row.payments) && row.payments.length > 0
        ? row.payments
        : (Number(row.paidGhs) || 0) > 0
          ? [
              {
                amountGhs: Number(row.paidGhs) || 0,
                paidAt: sfB2bInvoicePaymentDate(row) ?? row.createdAt,
              },
            ]
          : []

    for (const e of events) {
      const amount = Number(e.amountGhs) || 0
      if (amount <= 0) continue
      const raw = e.paidAt
      const d = raw instanceof Date ? raw : raw ? new Date(raw) : null
      if (!d || Number.isNaN(d.getTime()) || d < since || d > until) continue
      total += amount
    }
  }
  return total
}

export async function listB2BCashCollections(
  db: Db,
  opts?: { limit?: number },
): Promise<B2BCashCollectionDoc[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 5000, 1), 20_000)
  const rows = await b2bCashCollection(db)
    .find({})
    .sort({ collectedAt: -1 })
    .limit(limit)
    .toArray()
  return rows.map((r) => r as B2BCashCollectionDoc)
}

export async function createB2BCashCollection(
  db: Db,
  input: {
    amountGhs: number
    collectedAt: Date
    note?: string
    outletName?: string
    repName?: string
  },
): Promise<B2BCashCollectionDoc> {
  const now = new Date()
  const doc: WithoutId<B2BCashCollectionDoc> = {
    amountGhs: input.amountGhs,
    collectedAt: input.collectedAt,
    note: input.note?.trim() || undefined,
    outletName: input.outletName?.trim() || undefined,
    repName: input.repName?.trim() || undefined,
    createdAt: now,
  }
  const res = await b2bCashCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateB2BCashCollectionInput = Partial<{
  amountGhs: number
  collectedAt: Date
  note: string | null
  outletName: string | null
  repName: string | null
}>

export async function updateB2BCashCollection(
  db: Db,
  id: ObjectId,
  patch: UpdateB2BCashCollectionInput,
): Promise<B2BCashCollectionDoc | null> {
  const $set: Record<string, unknown> = {}
  if (patch.amountGhs !== undefined) {
    $set.amountGhs = Math.max(0, Math.min(1_000_000_000, patch.amountGhs))
  }
  if (patch.collectedAt !== undefined) $set.collectedAt = patch.collectedAt
  if (patch.note !== undefined) {
    $set.note =
      patch.note === null || patch.note === '' ? null : patch.note.trim()
  }
  if (patch.outletName !== undefined) {
    $set.outletName =
      patch.outletName === null || patch.outletName === ''
        ? null
        : patch.outletName.trim()
  }
  if (patch.repName !== undefined) {
    $set.repName =
      patch.repName === null || patch.repName === ''
        ? null
        : patch.repName.trim()
  }
  if (Object.keys($set).length === 0) return null

  const res = await b2bCashCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as B2BCashCollectionDoc | null
}

export async function deleteB2BCashCollection(
  db: Db,
  id: ObjectId,
): Promise<boolean> {
  const r = await b2bCashCollection(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}

export type PaymentSplitRow = {
  method: PaymentMethod
  label: string
  orders: number
  revenue: number
}

export type FinanceLayerSnapshot = {
  periodDays: number
  periodStart: string
  periodEnd: string
  /** Orders Engine (`dtc_orders`) in range, excluding B2B portal channel. */
  dtcRevenue: number
  /**
   * Customer Intelligence ledger collections in range (excludes Orders Engine mirror rows
   * so they are not double-counted with `dtcRevenue`).
   */
  dtcIntelCollectedGhs: number
  /** `dtcIntelCollectedGhs + dtcRevenue` — Master's DTC collected / Total revenue DTC leg. */
  dtcCollectedGhs: number
  b2bPortalOrderRevenue: number
  b2bInvoiceRevenue: number
  b2bInvoicePaidGhs: number
  b2bCashCollections: number
  b2bCollected: number
  totalRevenue: number
  cogsPctOfRevenue: number
  cogsGhs: number
  grossProfit: number
  marketingSpendGhs: number
  fixedOpexPeriodGhs: number
  netProfit: number
  b2bOutstandingGhs: number
  paymentSplit: PaymentSplitRow[]
}

/**
 * Sum Customer Intelligence ledger collections whose effective order date falls in range.
 * Excludes Orders Engine mirrors (remarks prefix OR orderNumber that exists on `dtc_orders`)
 * so those amounts are counted once via Orders Engine revenue.
 */
export async function sumDtcCustomerIntelCollectedInRange(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const oeOrderNumbers = await db
    .collection(DTC_ORDERS_COLLECTION)
    .distinct('orderNumber', {
      orderNumber: { $type: 'string', $ne: '' },
    })
  const oeSet = new Set(
    (oeOrderNumbers as unknown[])
      .map((n) => String(n ?? '').trim())
      .filter(Boolean),
  )

  const rows = await db
    .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
    .aggregate<{
      orderNumber?: string
      remarks?: string
      totalCollectedGhs?: number
      effectiveAt: Date
    }>([
      {
        $addFields: {
          effectiveAt: {
            $ifNull: [
              {
                $convert: { input: '$orderedAt', to: 'date', onError: null, onNull: null },
              },
              {
                $ifNull: [
                  {
                    $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null },
                  },
                  {
                    $convert: { input: '$updatedAt', to: 'date', onError: null, onNull: null },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          effectiveAt: { $gte: since, $lte: until },
        },
      },
      {
        $project: {
          orderNumber: 1,
          remarks: 1,
          totalCollectedGhs: 1,
          effectiveAt: 1,
        },
      },
    ])
    .toArray()

  let total = 0
  for (const r of rows) {
    const remarks = String(r.remarks ?? '')
    if (/^Orders Engine\s*·/i.test(remarks)) continue
    const on = String(r.orderNumber ?? '').trim()
    if (on && oeSet.has(on)) continue
    total += Number(r.totalCollectedGhs) || 0
  }
  return total
}

/** Orders Engine revenue in range with the same amount rules as the DTC dashboard OE half. */
export async function sumDtcOrdersEngineRevenueInRange(
  db: Db,
  since: Date,
  until: Date,
): Promise<{ dtcRevenue: number; b2bPortalOrderRevenue: number }> {
  const rows = await db
    .collection(DTC_ORDERS_COLLECTION)
    .aggregate<{
      channel?: string
      revenueGhs: number
    }>([
      {
        $addFields: {
          orderedAtDate: {
            $convert: { input: '$orderedAt', to: 'date', onError: null, onNull: null },
          },
        },
      },
      {
        $match: {
          orderedAtDate: { $gte: since, $lte: until },
        },
      },
      {
        $project: {
          channel: 1,
          totalAmount: {
            $convert: { input: '$totalAmount', to: 'double', onError: 0, onNull: 0 },
          },
          items: { $ifNull: ['$items', []] },
        },
      },
      {
        $addFields: {
          revenueFromItems: {
            $sum: {
              $map: {
                input: '$items',
                as: 'it',
                in: {
                  $multiply: [
                    {
                      $convert: { input: '$$it.qty', to: 'double', onError: 0, onNull: 0 },
                    },
                    {
                      $convert: { input: '$$it.unitPrice', to: 'double', onError: 0, onNull: 0 },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          channel: 1,
          revenueGhs: {
            $cond: [{ $gt: ['$totalAmount', 0] }, '$totalAmount', '$revenueFromItems'],
          },
        },
      },
    ])
    .toArray()

  let dtcRevenue = 0
  let b2bPortalOrderRevenue = 0
  for (const r of rows) {
    const amt = Number(r.revenueGhs) || 0
    if (r.channel === 'B2B portal') b2bPortalOrderRevenue += amt
    else dtcRevenue += amt
  }
  return { dtcRevenue, b2bPortalOrderRevenue }
}

export async function computeFinanceLayerSnapshot(
  db: Db,
  periodDays = 30,
): Promise<{ snapshot: FinanceLayerSnapshot; config: FinanceLayerConfigDoc }> {
  const until = new Date()
  const since = subDays(until, periodDays)
  return await computeFinanceLayerSnapshotForRange(db, { since, until, periodDays })
}

export async function computeFinanceLayerSnapshotForRange(
  db: Db,
  input: { since: Date; until: Date; periodDays?: number },
): Promise<{ snapshot: FinanceLayerSnapshot; config: FinanceLayerConfigDoc }> {
  const until = input.until
  const since = input.since
  const periodDays =
    input.periodDays ?? Math.max(1, Math.round((until.getTime() - since.getTime()) / 86_400_000))

  const config = await getOrCreateFinanceConfig(db)

  const [orderRevenues, dtcIntelCollectedGhs, paymentRows] = await Promise.all([
    sumDtcOrdersEngineRevenueInRange(db, since, until),
    sumDtcCustomerIntelCollectedInRange(db, since, until),
    db
      .collection(DTC_ORDERS_COLLECTION)
      .aggregate<{
        paymentMethod?: string
        revenueGhs: number
        orders: number
      }>([
        {
          $addFields: {
            orderedAtDate: {
              $convert: { input: '$orderedAt', to: 'date', onError: null, onNull: null },
            },
          },
        },
        { $match: { orderedAtDate: { $gte: since, $lte: until } } },
        {
          $project: {
            paymentMethod: 1,
            totalAmount: {
              $convert: { input: '$totalAmount', to: 'double', onError: 0, onNull: 0 },
            },
            items: { $ifNull: ['$items', []] },
          },
        },
        {
          $addFields: {
            revenueFromItems: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'it',
                  in: {
                    $multiply: [
                      {
                        $convert: { input: '$$it.qty', to: 'double', onError: 0, onNull: 0 },
                      },
                      {
                        $convert: {
                          input: '$$it.unitPrice',
                          to: 'double',
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            paymentMethod: 1,
            revenueGhs: {
              $cond: [{ $gt: ['$totalAmount', 0] }, '$totalAmount', '$revenueFromItems'],
            },
          },
        },
        {
          $group: {
            _id: '$paymentMethod',
            revenueGhs: { $sum: '$revenueGhs' },
            orders: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            paymentMethod: '$_id',
            revenueGhs: 1,
            orders: 1,
          },
        },
      ])
      .toArray(),
  ])

  const dtcRevenue = orderRevenues.dtcRevenue
  const b2bPortalOrderRevenue = orderRevenues.b2bPortalOrderRevenue

  const paymentAgg = new Map<PaymentMethod, { orders: number; revenue: number }>()
  for (const m of PAYMENT_METHODS_ORDER) {
    paymentAgg.set(m, { orders: 0, revenue: 0 })
  }
  for (const row of paymentRows) {
    const pm = row.paymentMethod as PaymentMethod
    if (!paymentAgg.has(pm)) {
      paymentAgg.set(pm, { orders: 0, revenue: 0 })
    }
    const bucket = paymentAgg.get(pm)!
    bucket.orders += Number(row.orders) || 0
    bucket.revenue += Number(row.revenueGhs) || 0
  }

  const b2bInvoiceRevenue = await sumSfB2bInvoiceRevenue(db, since, until)
  const b2bInvoicePaidGhs = await sumSfB2bInvoicePaidInRange(db, since, until)
  const b2bCashCollections = await sumB2BCashCollections(db, since, until)
  const dtcCollectedGhs = Math.max(0, dtcIntelCollectedGhs) + Math.max(0, dtcRevenue)
  const b2bCollected =
    Math.max(0, b2bPortalOrderRevenue) +
    Math.max(0, b2bInvoicePaidGhs) +
    Math.max(0, b2bCashCollections)
  const totalRevenue = dtcCollectedGhs + b2bCollected

  const spendMap = await spendByChannelFromCampaigns(db, since, until)
  let marketingSpendGhs = 0
  for (const v of spendMap.values()) marketingSpendGhs += v

  const cogsGhs = totalRevenue * config.cogsPctOfRevenue
  const grossProfit = totalRevenue - cogsGhs
  const netProfit =
    grossProfit - marketingSpendGhs - config.fixedOpexPeriodGhs

  const paymentSplit: PaymentSplitRow[] = []
  for (const method of PAYMENT_METHODS_ORDER) {
    const p = paymentAgg.get(method)!
    paymentSplit.push({
      method,
      label: PAYMENT_METHOD_LABELS[method],
      orders: p.orders,
      revenue: p.revenue,
    })
  }
  for (const [method, p] of paymentAgg) {
    if (!PAYMENT_METHODS_ORDER.includes(method) && (p.orders > 0 || p.revenue > 0)) {
      paymentSplit.push({
        method,
        label: PAYMENT_METHOD_LABELS[method] ?? method,
        orders: p.orders,
        revenue: p.revenue,
      })
    }
  }

  return {
    config,
    snapshot: {
      periodDays,
      periodStart: since.toISOString(),
      periodEnd: until.toISOString(),
      dtcRevenue,
      dtcIntelCollectedGhs,
      dtcCollectedGhs,
      b2bPortalOrderRevenue,
      b2bInvoiceRevenue,
      b2bInvoicePaidGhs,
      b2bCashCollections,
      b2bCollected,
      totalRevenue,
      cogsPctOfRevenue: config.cogsPctOfRevenue,
      cogsGhs,
      grossProfit,
      marketingSpendGhs,
      fixedOpexPeriodGhs: config.fixedOpexPeriodGhs,
      netProfit,
      b2bOutstandingGhs: config.b2bOutstandingGhs,
      paymentSplit,
    },
  }
}
