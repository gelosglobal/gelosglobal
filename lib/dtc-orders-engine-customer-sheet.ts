import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION = 'dtc_orders_engine_customers'

export type DtcOrdersEngineCustomerDoc = {
  _id: ObjectId
  customerName: string
  phoneNumber?: string
  totalOrders?: number
  totalBilledGhs?: number
  totalCollectedGhs?: number
  location?: string
  returned?: number
  firstOrderAt?: Date
  lastOrderAt?: Date
  importRowIndex?: number
  createdAt: Date
  updatedAt: Date
}

export type DtcOrdersEngineCustomerJson = {
  id: string
  customerName: string
  phoneNumber: string
  totalOrders: number
  totalBilledGhs: number
  totalCollectedGhs: number
  location: string
  returned: number
  firstOrderDate: string
  lastOrderDate: string
}

export function serializeDtcOrdersEngineCustomer(
  doc: DtcOrdersEngineCustomerDoc,
): DtcOrdersEngineCustomerJson {
  const d1 =
    doc.firstOrderAt instanceof Date && !Number.isNaN(doc.firstOrderAt.getTime())
      ? doc.firstOrderAt
      : doc.firstOrderAt != null
        ? (() => {
            const d = new Date(String(doc.firstOrderAt))
            return Number.isNaN(d.getTime()) ? null : d
          })()
        : null
  const d2 =
    doc.lastOrderAt instanceof Date && !Number.isNaN(doc.lastOrderAt.getTime())
      ? doc.lastOrderAt
      : doc.lastOrderAt != null
        ? (() => {
            const d = new Date(String(doc.lastOrderAt))
            return Number.isNaN(d.getTime()) ? null : d
          })()
        : null

  return {
    id: doc._id.toHexString(),
    customerName: doc.customerName,
    phoneNumber: doc.phoneNumber ?? '',
    totalOrders: Number(doc.totalOrders ?? 0) || 0,
    totalBilledGhs: Number(doc.totalBilledGhs ?? 0) || 0,
    totalCollectedGhs: Number(doc.totalCollectedGhs ?? 0) || 0,
    location: doc.location ?? '',
    returned: Number(doc.returned ?? 0) || 0,
    firstOrderDate: d1 ? d1.toISOString().slice(0, 10) : '',
    lastOrderDate: d2 ? d2.toISOString().slice(0, 10) : '',
  }
}

function coll(db: Db) {
  return db.collection<WithoutId<DtcOrdersEngineCustomerDoc>>(DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION)
}

export async function listOrdersEngineCustomers(db: Db): Promise<DtcOrdersEngineCustomerDoc[]> {
  const rows = await coll(db).find({}).sort({ totalBilledGhs: -1, totalOrders: -1, _id: 1 }).limit(30_000).toArray()
  return rows.map((r) => r as DtcOrdersEngineCustomerDoc)
}

