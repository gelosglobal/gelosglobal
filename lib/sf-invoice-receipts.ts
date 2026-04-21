import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_INVOICE_RECEIPTS_COLLECTION = 'sf_invoice_receipts'

export type SfInvoiceReceiptItem = {
  description: string
  qty: number
  unitPriceGhs: number
}

export type SfInvoiceReceiptDoc = {
  _id: ObjectId
  outletName: string
  invoiceNumber: string
  invoiceAt?: Date
  billFrom?: string
  dueAt?: Date
  items: SfInvoiceReceiptItem[]
  amountGhs: number
  discountGhs?: number
  taxGhs?: number
  totalGhs: number
  createdAt: Date
}

export type SfInvoiceReceiptJson = {
  id: string
  outletName: string
  invoiceNumber: string
  invoiceAt: string | null
  billFrom: string | null
  dueAt: string | null
  items: SfInvoiceReceiptItem[]
  amountGhs: number
  discountGhs: number
  taxGhs: number
  totalGhs: number
  createdAt: string
}

export function serializeSfInvoiceReceipt(doc: SfInvoiceReceiptDoc): SfInvoiceReceiptJson {
  return {
    id: doc._id.toHexString(),
    outletName: doc.outletName,
    invoiceNumber: doc.invoiceNumber,
    invoiceAt: doc.invoiceAt ? doc.invoiceAt.toISOString() : null,
    billFrom: doc.billFrom ? doc.billFrom : null,
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    items: Array.isArray(doc.items) ? doc.items : [],
    amountGhs: Number(doc.amountGhs) || 0,
    discountGhs: Number.isFinite(doc.discountGhs as number) ? (doc.discountGhs as number) : 0,
    taxGhs: Number.isFinite(doc.taxGhs as number) ? (doc.taxGhs as number) : 0,
    totalGhs: Number(doc.totalGhs) || 0,
    createdAt: doc.createdAt.toISOString(),
  }
}

function receiptsCollection(db: Db) {
  return db.collection<WithoutId<SfInvoiceReceiptDoc>>(SF_INVOICE_RECEIPTS_COLLECTION)
}

export type CreateSfInvoiceReceiptInput = {
  outletName: string
  invoiceNumber: string
  invoiceAt?: Date
  billFrom?: string
  dueAt?: Date
  items: SfInvoiceReceiptItem[]
  amountGhs: number
  discountGhs?: number
  taxGhs?: number
  totalGhs: number
}

export async function createSfInvoiceReceipt(
  db: Db,
  input: CreateSfInvoiceReceiptInput,
): Promise<SfInvoiceReceiptDoc> {
  const now = new Date()
  const doc: WithoutId<SfInvoiceReceiptDoc> = {
    outletName: input.outletName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceAt: input.invoiceAt,
    billFrom: input.billFrom?.trim() ? input.billFrom.trim().slice(0, 200) : undefined,
    dueAt: input.dueAt,
    items: (input.items ?? []).map((it) => ({
      description: it.description.trim(),
      qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
      unitPriceGhs: Math.max(0, Number(it.unitPriceGhs) || 0),
    })),
    amountGhs: Math.max(0, Number(input.amountGhs) || 0),
    discountGhs:
      typeof input.discountGhs === 'number' && Number.isFinite(input.discountGhs) && input.discountGhs > 0
        ? Math.max(0, input.discountGhs)
        : undefined,
    taxGhs:
      typeof input.taxGhs === 'number' && Number.isFinite(input.taxGhs) && input.taxGhs > 0
        ? Math.max(0, input.taxGhs)
        : undefined,
    totalGhs: Math.max(0, Number(input.totalGhs) || 0),
    createdAt: now,
  }
  const res = await receiptsCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export async function listSfInvoiceReceipts(db: Db): Promise<SfInvoiceReceiptDoc[]> {
  const rows = await receiptsCollection(db)
    .find({})
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray()
  return rows.map((r) => r as SfInvoiceReceiptDoc)
}

