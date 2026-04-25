import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

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

