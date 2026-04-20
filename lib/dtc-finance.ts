import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { subDays } from 'date-fns'
import { spendByChannelFromCampaigns } from '@/lib/dtc-marketing-campaigns'
import {
  DTC_ORDERS_COLLECTION,
  type DtcOrderDoc,
  type PaymentMethod,
} from '@/lib/dtc-orders'
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

export async function sumSfB2bInvoiceRevenue(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .aggregate<{ total: number }>([
      {
        $match: {
          $or: [
            { createdAt: { $gte: since, $lte: until } },
            { updatedAt: { $gte: since, $lte: until } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amountGhs' } } },
    ])
    .toArray()
  return rows[0]?.total ?? 0
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
  dtcRevenue: number
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

  const orders = (await db
    .collection(DTC_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: since, $lte: until } })
    .project({
      channel: 1,
      totalAmount: 1,
      paymentMethod: 1,
    })
    .limit(20000)
    .toArray()) as Pick<DtcOrderDoc, 'channel' | 'totalAmount' | 'paymentMethod'>[]

  let dtcRevenue = 0
  let b2bPortalOrderRevenue = 0
  const paymentAgg = new Map<
    PaymentMethod,
    { orders: number; revenue: number }
  >()
  for (const m of PAYMENT_METHODS_ORDER) {
    paymentAgg.set(m, { orders: 0, revenue: 0 })
  }

  for (const o of orders) {
    const pm = o.paymentMethod as PaymentMethod
    if (!paymentAgg.has(pm)) {
      paymentAgg.set(pm, { orders: 0, revenue: 0 })
    }
    const row = paymentAgg.get(pm)!
    row.orders += 1
    row.revenue += o.totalAmount

    if (o.channel === 'B2B portal') {
      b2bPortalOrderRevenue += o.totalAmount
    } else {
      dtcRevenue += o.totalAmount
    }
  }

  const b2bInvoiceRevenue = await sumSfB2bInvoiceRevenue(db, since, until)
  const b2bInvoicePaidGhs = await sumSfB2bInvoicePaidTotal(db)
  const b2bCashCollections = await sumB2BCashCollections(db, since, until)
  const b2bCollected = b2bPortalOrderRevenue + b2bInvoiceRevenue + b2bCashCollections
  const totalRevenue = dtcRevenue + b2bCollected

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
