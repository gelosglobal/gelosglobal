import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { startOfDay } from 'date-fns'

export const SF_ORDERS_COLLECTION = 'sf_orders'

export type SfOrderStatus = 'ordered' | 'in_transit' | 'arrived'

export type SfOrderItem = {
  sku?: string
  name: string
  qty: number
  unitPriceGhs: number
}

export type SfOrderDoc = {
  _id: ObjectId
  orderNumber: string
  outletName: string
  repName?: string
  items: SfOrderItem[]
  totalGhs: number
  paidGhs: number
  dueAt?: Date
  status: SfOrderStatus
  orderedAt: Date
  notes?: string
  createdAt: Date
}

export type SfOrderJson = {
  id: string
  orderNumber: string
  outletName: string
  repName: string | null
  items: SfOrderItem[]
  totalGhs: number
  paidGhs: number
  balanceGhs: number
  dueAt: string | null
  status: SfOrderStatus
  orderedAt: string
  notes: string | null
  createdAt: string
}

export function serializeSfOrder(doc: SfOrderDoc): SfOrderJson {
  const paid = Number.isFinite(doc.paidGhs) ? doc.paidGhs : 0
  const balance = Math.max(0, doc.totalGhs - paid)
  return {
    id: doc._id.toHexString(),
    orderNumber: doc.orderNumber,
    outletName: doc.outletName,
    repName: doc.repName ?? null,
    items: doc.items,
    totalGhs: doc.totalGhs,
    paidGhs: paid,
    balanceGhs: balance,
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    status: doc.status,
    orderedAt: doc.orderedAt.toISOString(),
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
  }
}

function ordersCollection(db: Db) {
  return db.collection<WithoutId<SfOrderDoc>>(SF_ORDERS_COLLECTION)
}

function newOrderNumber(): string {
  return `SF-${Date.now().toString(36).toUpperCase()}`
}

export async function listSfOrders(db: Db): Promise<SfOrderDoc[]> {
  const rows = await ordersCollection(db)
    .find({})
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as SfOrderDoc)
}

export type CreateSfOrderInput = {
  outletName: string
  repName?: string
  items: SfOrderItem[]
  paidGhs?: number
  dueAt?: Date
  status?: SfOrderStatus
  orderedAt?: Date
  notes?: string
}

export async function createSfOrder(db: Db, input: CreateSfOrderInput): Promise<SfOrderDoc> {
  const total = input.items.reduce((s, it) => s + it.qty * it.unitPriceGhs, 0)
  const paid = Math.max(0, Math.min(total, input.paidGhs ?? 0))
  const doc: WithoutId<SfOrderDoc> = {
    orderNumber: newOrderNumber(),
    outletName: input.outletName.trim(),
    repName: input.repName?.trim() || undefined,
    items: input.items.map((i) => ({
      sku: i.sku?.trim() ? i.sku.trim() : undefined,
      name: i.name.trim(),
      qty: i.qty,
      unitPriceGhs: i.unitPriceGhs,
    })),
    totalGhs: total,
    paidGhs: paid,
    dueAt: input.dueAt,
    status: input.status ?? 'ordered',
    orderedAt: input.orderedAt ?? new Date(),
    notes: input.notes?.trim() || undefined,
    createdAt: new Date(),
  }
  const res = await ordersCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export async function deleteSfOrder(db: Db, id: ObjectId): Promise<boolean> {
  const res = await ordersCollection(db).deleteOne({ _id: id })
  return res.deletedCount === 1
}

export type UpdateSfOrderInput = Partial<{
  outletName: string
  repName: string | null
  paidGhs: number
  dueAt: Date | null
  status: SfOrderStatus
  orderedAt: Date
  notes: string | null
}>

export async function updateSfOrder(
  db: Db,
  id: ObjectId,
  patch: UpdateSfOrderInput,
): Promise<SfOrderDoc | null> {
  const $set: Record<string, unknown> = {}
  if (patch.outletName !== undefined) $set.outletName = patch.outletName.trim()
  if (patch.repName !== undefined) $set.repName = patch.repName ? patch.repName.trim() : undefined
  if (patch.dueAt !== undefined) $set.dueAt = patch.dueAt ?? undefined
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.orderedAt !== undefined) $set.orderedAt = patch.orderedAt
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  if (patch.paidGhs !== undefined) {
    // Clamp paid to [0, totalGhs] using pipeline update
    const res = await ordersCollection(db).findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            ...$set,
            paidGhs: {
              $min: [
                '$totalGhs',
                { $max: [0, patch.paidGhs] },
              ],
            },
          },
        },
      ],
      { returnDocument: 'after' },
    )
    return res as SfOrderDoc | null
  }

  if (Object.keys($set).length === 0) return null
  const res = await ordersCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfOrderDoc | null
}

export function computeSfOrderStats(orders: Pick<SfOrderDoc, 'orderedAt' | 'totalGhs' | 'status'>[]) {
  const start = startOfDay(new Date())
  let ordersToday = 0
  let awaitingArrival = 0
  let sum = 0
  for (const o of orders) {
    if (o.orderedAt >= start) ordersToday += 1
    if (o.status === 'ordered' || o.status === 'in_transit') awaitingArrival += 1
    sum += o.totalGhs
  }
  const avgOrderValue = orders.length === 0 ? 0 : sum / orders.length
  return { ordersToday, awaitingArrival, avgOrderValue }
}

