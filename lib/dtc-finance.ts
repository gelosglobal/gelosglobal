import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { subDays } from 'date-fns'
import { spendByChannelFromCampaigns } from '@/lib/dtc-marketing-campaigns'
import {
  DTC_ORDERS_COLLECTION,
  type DtcOrderDoc,
  type PaymentMethod,
} from '@/lib/dtc-orders'

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

export async function createB2BCashCollection(
  db: Db,
  input: { amountGhs: number; collectedAt: Date; note?: string },
): Promise<B2BCashCollectionDoc> {
  const now = new Date()
  const doc: WithoutId<B2BCashCollectionDoc> = {
    amountGhs: input.amountGhs,
    collectedAt: input.collectedAt,
    note: input.note?.trim() || undefined,
    createdAt: now,
  }
  const res = await b2bCashCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
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

  const b2bCashCollections = await sumB2BCashCollections(db, since, until)
  const b2bCollected = b2bPortalOrderRevenue + b2bCashCollections
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
