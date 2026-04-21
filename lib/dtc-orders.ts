import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { startOfDay } from 'date-fns'

export const DTC_ORDERS_COLLECTION = 'dtc_orders'

export type OrderStatus = 'fulfilled' | 'processing' | 'pending_payment'
export type PaymentMethod =
  | 'cash'
  | 'momo'
  | 'card'
  | 'bank_transfer'
  | 'pay_on_delivery'

export type DtcOrderItem = {
  sku?: string
  name: string
  qty: number
  unitPrice: number
}

export type DtcOrderDoc = {
  _id: ObjectId
  orderNumber: string
  customer: string
  channel: string
  paymentMethod: PaymentMethod
  items: DtcOrderItem[]
  discountGhs?: number
  totalAmount: number
  currency: 'GHS'
  status: OrderStatus
  orderedAt: Date
  createdAt: Date
}

export type DtcOrderJson = {
  id: string
  orderNumber: string
  customer: string
  channel: string
  paymentMethod: PaymentMethod
  items: DtcOrderItem[]
  discountGhs: number
  totalAmount: number
  currency: 'GHS'
  status: OrderStatus
  orderedAt: string
  createdAt: string
}

export function serializeOrder(doc: DtcOrderDoc): DtcOrderJson {
  return {
    id: doc._id.toHexString(),
    orderNumber: doc.orderNumber,
    customer: doc.customer,
    channel: doc.channel,
    paymentMethod: doc.paymentMethod,
    items: doc.items,
    discountGhs: Number.isFinite(doc.discountGhs as number) ? (doc.discountGhs as number) : 0,
    totalAmount: doc.totalAmount,
    currency: doc.currency,
    status: doc.status,
    orderedAt: doc.orderedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  }
}

function ordersCollection(db: Db) {
  return db.collection<WithoutId<DtcOrderDoc>>(DTC_ORDERS_COLLECTION)
}

export async function listDtcOrders(db: Db): Promise<DtcOrderDoc[]> {
  const rows = await ordersCollection(db)
    .find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray()
  return rows.map((r) => r as DtcOrderDoc)
}

function newOrderNumber(): string {
  return `DTC-${Date.now().toString(36).toUpperCase()}`
}

export type CreateDtcOrderInput = {
  customer: string
  channel: string
  paymentMethod: PaymentMethod
  items: DtcOrderItem[]
  discountGhs?: number
  status?: OrderStatus
  orderedAt?: Date
}

export async function createDtcOrder(
  db: Db,
  input: CreateDtcOrderInput,
): Promise<DtcOrderDoc> {
  const subtotal = input.items.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0,
  )
  const discount = Math.max(0, Math.min(subtotal, input.discountGhs ?? 0))
  const totalAmount = Math.max(0, subtotal - discount)
  const doc: WithoutId<DtcOrderDoc> = {
    orderNumber: newOrderNumber(),
    customer: input.customer.trim(),
    channel: input.channel,
    paymentMethod: input.paymentMethod,
    items: input.items,
    discountGhs: discount > 0 ? discount : undefined,
    totalAmount,
    currency: 'GHS',
    status: input.status ?? 'processing',
    orderedAt: input.orderedAt ?? new Date(),
    createdAt: new Date(),
  }
  const res = await ordersCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export async function deleteDtcOrder(db: Db, id: ObjectId): Promise<boolean> {
  const res = await ordersCollection(db).deleteOne({ _id: id })
  return res.deletedCount === 1
}

export type UpdateDtcOrderInput = Partial<{
  customer: string
  channel: string
  paymentMethod: PaymentMethod
  items: DtcOrderItem[]
  discountGhs: number | null
  status: OrderStatus
  orderedAt: Date
}>

export async function updateDtcOrder(
  db: Db,
  id: ObjectId,
  patch: UpdateDtcOrderInput,
): Promise<DtcOrderDoc | null> {
  const $set: Record<string, unknown> = {}

  if (patch.customer !== undefined) $set.customer = patch.customer.trim()
  if (patch.channel !== undefined) $set.channel = patch.channel
  if (patch.paymentMethod !== undefined) $set.paymentMethod = patch.paymentMethod
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.orderedAt !== undefined) $set.orderedAt = patch.orderedAt

  let recomputeTotals = false
  if (patch.items !== undefined) {
    $set.items = patch.items
    recomputeTotals = true
  }
  if (patch.discountGhs !== undefined) {
    $set.discountGhs = patch.discountGhs ?? undefined
    recomputeTotals = true
  }

  if (Object.keys($set).length === 0) return null

  if (recomputeTotals) {
    const existing = await ordersCollection(db).findOne({ _id: id })
    if (!existing) return null
    const items = (patch.items ?? (existing as DtcOrderDoc).items) as DtcOrderItem[]
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
    const discountInput =
      patch.discountGhs === undefined
        ? (existing as DtcOrderDoc).discountGhs ?? 0
        : patch.discountGhs ?? 0
    const discount = Math.max(0, Math.min(subtotal, discountInput))
    const totalAmount = Math.max(0, subtotal - discount)
    $set.discountGhs = discount > 0 ? discount : undefined
    $set.totalAmount = totalAmount
  }

  const res = await ordersCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as DtcOrderDoc | null
}

export function computeOrderStats(
  orders: Pick<DtcOrderDoc, 'orderedAt' | 'totalAmount' | 'status'>[],
) {
  const start = startOfDay(new Date())
  let ordersToday = 0
  let awaitingFulfillment = 0
  let sum = 0
  for (const o of orders) {
    if (o.orderedAt >= start) ordersToday += 1
    if (o.status === 'processing' || o.status === 'pending_payment') {
      awaitingFulfillment += 1
    }
    sum += o.totalAmount
  }
  const avgOrderValue = orders.length === 0 ? 0 : sum / orders.length
  return {
    ordersToday,
    avgOrderValue,
    awaitingFulfillment,
  }
}

export function formatGhs(amount: number | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `GHS ${n.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
