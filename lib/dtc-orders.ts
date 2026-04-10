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
  status?: OrderStatus
  orderedAt?: Date
}

export async function createDtcOrder(
  db: Db,
  input: CreateDtcOrderInput,
): Promise<DtcOrderDoc> {
  const totalAmount = input.items.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0,
  )
  const doc: WithoutId<DtcOrderDoc> = {
    orderNumber: newOrderNumber(),
    customer: input.customer.trim(),
    channel: input.channel,
    paymentMethod: input.paymentMethod,
    items: input.items,
    totalAmount,
    currency: 'GHS',
    status: input.status ?? 'processing',
    orderedAt: input.orderedAt ?? new Date(),
    createdAt: new Date(),
  }
  const res = await ordersCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
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

export function formatGhs(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
