import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { applyDtcCustomerImport, type DtcImportRow } from '@/lib/dtc-customer-import-apply'
import type { DtcOrderDoc, OrderStatus } from '@/lib/dtc-orders'

export const DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION = 'dtc_customer_intelligence_ledger'

export type DtcCustomerIntelLedgerItem = {
  sku?: string
  name: string
  qty: number
  unitPrice: number
}

export type DtcCustomerIntelLedgerDoc = {
  _id: ObjectId
  orderedAt?: Date
  orderNumber?: string
  itemsOrdered?: string
  items?: DtcCustomerIntelLedgerItem[]
  customerName: string
  phoneNumber?: string
  location?: string
  riderAssigned?: string
  amountToCollectGhs?: number
  cashCollectedGhs?: number
  momoCollectedGhs?: number
  paystackCollectedGhs?: number
  totalCollectedGhs?: number
  paymentMethod?: string
  deliveryStatus?: string
  remarks?: string
  additionalRemarks?: string
  importRowIndex?: number
  createdAt: Date
  updatedAt: Date
}

export type DtcCustomerIntelLedgerJson = {
  id: string
  orderedAt: string | null
  /** Row insert time — used when `orderedAt` is missing so UI never invents “today” on the client. */
  createdAt: string
  /** Last update time — tertiary fallback for ordering/display. */
  updatedAt: string
  orderNumber: string
  itemsOrdered: string
  items: DtcCustomerIntelLedgerItem[]
  customerName: string
  phoneNumber: string
  location: string
  riderAssigned: string
  amountToCollectGhs: number
  cashCollectedGhs: number
  momoCollectedGhs: number
  paystackCollectedGhs: number
  totalCollectedGhs: number
  paymentMethod: string
  deliveryStatus: string
  remarks: string
  additionalRemarks: string
}

function toIsoOrEpoch(d: unknown): string {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString()
  if (d != null) {
    const parsed = new Date(String(d))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

/**
 * Single timestamp for sorting / rollups when `orderedAt` is null (common on legacy imports).
 * Never uses the browser clock — avoids phantom “today” rows in staff dashboards.
 */
export function resolveDtcCustomerIntelLedgerOrderedAtIso(
  row: Pick<DtcCustomerIntelLedgerJson, 'orderedAt' | 'createdAt' | 'updatedAt'>,
): string {
  for (const raw of [row.orderedAt, row.createdAt, row.updatedAt]) {
    if (raw == null) continue
    const s = String(raw).trim()
    if (!s) continue
    const ms = new Date(s).getTime()
    if (Number.isFinite(ms)) return new Date(s).toISOString()
  }
  return new Date(0).toISOString()
}

export function serializeDtcCustomerIntelLedgerRow(
  doc: DtcCustomerIntelLedgerDoc,
): DtcCustomerIntelLedgerJson {
  const orderedAt =
    doc.orderedAt instanceof Date && !Number.isNaN(doc.orderedAt.getTime())
      ? doc.orderedAt
      : doc.orderedAt != null
        ? (() => {
            const d = new Date(String(doc.orderedAt))
            return Number.isNaN(d.getTime()) ? null : d
          })()
        : null
  return {
    id: doc._id.toHexString(),
    orderedAt: orderedAt ? orderedAt.toISOString() : null,
    createdAt: toIsoOrEpoch(doc.createdAt),
    updatedAt: toIsoOrEpoch(doc.updatedAt),
    orderNumber: doc.orderNumber ?? '',
    itemsOrdered: doc.itemsOrdered ?? '',
    items: Array.isArray(doc.items)
      ? doc.items
          .map((it) => ({
            ...(it.sku != null && String(it.sku).trim() ? { sku: String(it.sku).trim() } : {}),
            name: String((it as any).name ?? '').trim(),
            qty: Number((it as any).qty ?? 0) || 0,
            unitPrice: Number((it as any).unitPrice ?? 0) || 0,
          }))
          .filter((it) => it.name && Number.isFinite(it.qty) && it.qty > 0)
      : [],
    customerName: doc.customerName,
    phoneNumber: doc.phoneNumber ?? '',
    location: doc.location ?? '',
    riderAssigned: doc.riderAssigned ?? '',
    amountToCollectGhs: Number(doc.amountToCollectGhs ?? 0) || 0,
    cashCollectedGhs: Number(doc.cashCollectedGhs ?? 0) || 0,
    momoCollectedGhs: Number(doc.momoCollectedGhs ?? 0) || 0,
    paystackCollectedGhs: Number(doc.paystackCollectedGhs ?? 0) || 0,
    totalCollectedGhs: Number(doc.totalCollectedGhs ?? 0) || 0,
    paymentMethod: doc.paymentMethod ?? '',
    deliveryStatus: doc.deliveryStatus ?? '',
    remarks: doc.remarks ?? '',
    additionalRemarks: doc.additionalRemarks ?? '',
  }
}

function ledgerCollection(db: Db) {
  return db.collection<WithoutId<DtcCustomerIntelLedgerDoc>>(
    DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION,
  )
}

export async function listDtcCustomerIntelLedgerRows(
  db: Db,
): Promise<DtcCustomerIntelLedgerDoc[]> {
  const rows = await ledgerCollection(db)
    .find({})
    .sort({ orderedAt: -1, updatedAt: -1, _id: -1 })
    .limit(20_000)
    .toArray()
  return rows.map((r) => r as DtcCustomerIntelLedgerDoc)
}

/** Normalized phone key for matching ledger rows to customers (same rules as API import). */
export function dtcCustomerIntelLedgerPhoneKey(v: string | undefined) {
  return String(v ?? '')
    .replace(/[^\d+]/g, '')
    .trim()
    .slice(0, 40)
}

export function formatLedgerItemsOrderedFromItems(items: DtcCustomerIntelLedgerItem[]): string {
  return items
    .map((it) => (it.qty > 1 ? `${it.name} x${it.qty}` : it.name))
    .filter(Boolean)
    .join(', ')
}

function isReturnedish(s: string) {
  const t = s.trim().toLowerCase()
  return t.includes('returned') || t.includes('return')
}

/**
 * Recompute `dtc_customers` totals from all ledger rows for this customer + phone
 * (same logic as POST /api/dtc/customer-intelligence).
 */
export async function syncDtcCustomerTotalsFromIntelLedger(
  db: Db,
  customerName: string,
  phoneNumber: string | undefined,
): Promise<void> {
  const name = customerName.trim()
  const p = dtcCustomerIntelLedgerPhoneKey(phoneNumber) || ''
  const rows = await db
    .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
    .find(
      { customerName: name, phoneNumber: p ? p : { $in: [undefined, null, ''] } },
      {
        projection: {
          orderedAt: 1,
          amountToCollectGhs: 1,
          totalCollectedGhs: 1,
          cashCollectedGhs: 1,
          momoCollectedGhs: 1,
          paystackCollectedGhs: 1,
          location: 1,
          riderAssigned: 1,
          deliveryStatus: 1,
          remarks: 1,
          additionalRemarks: 1,
        },
      },
    )
    .toArray()

  let orders = 0
  let billed = 0
  let collected = 0
  let cash = 0
  let momo = 0
  let paystack = 0
  let returnedCount = 0
  let firstAt: Date | undefined = undefined
  let lastAt: Date | undefined = undefined
  let location: string | undefined = undefined
  let riderAssigned: string | undefined = undefined
  let remarks: string | undefined = undefined

  for (const r of rows as any[]) {
    orders += 1
    billed += Number(r.amountToCollectGhs ?? 0) || 0
    collected += Number(r.totalCollectedGhs ?? 0) || 0
    cash += Number(r.cashCollectedGhs ?? 0) || 0
    momo += Number(r.momoCollectedGhs ?? 0) || 0
    paystack += Number(r.paystackCollectedGhs ?? 0) || 0
    const hit =
      isReturnedish(String(r.deliveryStatus ?? '')) ||
      isReturnedish(String(r.remarks ?? '')) ||
      isReturnedish(String(r.additionalRemarks ?? ''))
    if (hit) returnedCount += 1

    if (r.location) location = String(r.location)
    if (r.riderAssigned) riderAssigned = String(r.riderAssigned)
    const dt =
      r.orderedAt instanceof Date ? r.orderedAt : r.orderedAt ? new Date(String(r.orderedAt)) : null
    if (dt && !Number.isNaN(dt.getTime())) {
      if (!firstAt || dt.getTime() < firstAt.getTime()) firstAt = dt
      if (!lastAt || dt.getTime() > lastAt.getTime()) lastAt = dt
    }
    const rm = [r.remarks, r.additionalRemarks].filter(Boolean).join(' · ')
    if (rm) remarks = String(rm)
  }

  const importRow: DtcImportRow = {
    customer: name,
    phone: p || undefined,
    location,
    riderAssigned,
    remarks,
    amountToBeCollectedGhs: billed,
    acCashCollectedGhs: cash,
    acMomoGhs: momo,
    acPaystackGhs: paystack,
    importTotalOrders: orders,
    importTotalBilledGhs: billed,
    importTotalCollectedGhs: collected,
    importReturnedCount: returnedCount,
    importFirstOrderAt: firstAt,
    importLastOrderAt: lastAt,
  }
  await applyDtcCustomerImport(db, [importRow], true)
}

export async function insertDtcCustomerIntelLedgerRow(
  db: Db,
  doc: WithoutId<DtcCustomerIntelLedgerDoc>,
): Promise<DtcCustomerIntelLedgerDoc> {
  const res = await ledgerCollection(db).insertOne(doc)
  const created = { _id: res.insertedId, ...doc } as DtcCustomerIntelLedgerDoc
  try {
    await syncDtcCustomerTotalsFromIntelLedger(db, doc.customerName, doc.phoneNumber)
  } catch {
    // best-effort; ledger row creation should still succeed
  }
  return created
}

function orderStatusToDeliveryLabel(status: OrderStatus): string {
  switch (status) {
    case 'fulfilled':
      return 'Fulfilled'
    case 'processing':
      return 'Processing'
    case 'pending_payment':
      return 'Pending payment'
    default:
      return String(status)
  }
}

/**
 * When a row is created or updated in Orders Engine (`dtc_orders`), mirror it into the Customer
 * Intelligence ledger so CI stays a summary of the engine. **Order date** (`orderedAt`) and other
 * engine fields always follow the order document. Idempotent / upsert by `orderNumber`.
 *
 * Ledger-only fields (collections, rider, extra remarks) are preserved on update.
 */
export async function mirrorDtcOrderToCustomerIntelLedger(
  db: Db,
  order: DtcOrderDoc,
): Promise<DtcCustomerIntelLedgerDoc | null> {
  const orderNumber = String(order.orderNumber ?? '').trim()
  if (!orderNumber) return null

  const coll = ledgerCollection(db)
  const now = new Date()
  const items: DtcCustomerIntelLedgerItem[] = (order.items ?? [])
    .map((it) => ({
      ...(it.sku?.trim() ? { sku: it.sku.trim() } : {}),
      name: String(it.name ?? '').trim(),
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
    }))
    .filter((it) => it.name && Number.isFinite(it.qty) && it.qty > 0)

  const computedItemsOrdered = formatLedgerItemsOrderedFromItems(items)

  const engineFields = {
    /** Same instant as `dtc_orders.orderedAt` — this is the order date shown in Customer Intelligence. */
    orderedAt: order.orderedAt,
    orderNumber,
    itemsOrdered: computedItemsOrdered || undefined,
    items: items.length ? items : undefined,
    customerName: order.customer.trim(),
    phoneNumber: dtcCustomerIntelLedgerPhoneKey(order.customerPhone) || undefined,
    location: order.customerLocation?.trim() || undefined,
    amountToCollectGhs: order.totalAmount,
    paymentMethod: order.paymentMethod,
    deliveryStatus: orderStatusToDeliveryLabel(order.status),
    remarks: `Orders Engine · ${order.channel}`,
    updatedAt: now,
  }

  const existing = await coll.findOne({ orderNumber })
  if (existing) {
    const prevName = String(existing.customerName ?? '').trim()
    const prevPhone = existing.phoneNumber

    await coll.updateOne(
      { _id: existing._id },
      {
        $set: engineFields,
      },
    )
    try {
      await syncDtcCustomerTotalsFromIntelLedger(
        db,
        engineFields.customerName,
        engineFields.phoneNumber,
      )
      if (
        prevName &&
        (prevName !== engineFields.customerName || prevPhone !== engineFields.phoneNumber)
      ) {
        await syncDtcCustomerTotalsFromIntelLedger(db, prevName, prevPhone)
      }
    } catch {
      // best-effort
    }
    const after = await coll.findOne({ _id: existing._id })
    return (after ?? { ...existing, ...engineFields, _id: existing._id }) as DtcCustomerIntelLedgerDoc
  }

  const doc: WithoutId<DtcCustomerIntelLedgerDoc> = {
    ...engineFields,
    riderAssigned: undefined,
    cashCollectedGhs: 0,
    momoCollectedGhs: 0,
    paystackCollectedGhs: 0,
    totalCollectedGhs: 0,
    additionalRemarks: undefined,
    createdAt: now,
    updatedAt: now,
  }

  return insertDtcCustomerIntelLedgerRow(db, doc)
}

