import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_B2B_INVOICES_COLLECTION = 'sf_b2b_invoices'

export type SfB2bPaymentMethod = 'momo' | 'cash' | 'bank_transfer' | 'cheque'

export type SfB2bInvoiceItem = {
  name: string
  sku?: string
  qty: number
  unitPriceGhs: number
}

export type SfB2bInvoiceDoc = {
  _id: ObjectId
  outletName: string
  invoiceNumber: string
  /** Date on the invoice document (optional; defaults to createdAt). */
  invoiceAt?: Date
  amountGhs: number
  discountGhs?: number
  paidGhs: number
  paymentMethod?: SfB2bPaymentMethod
  items?: SfB2bInvoiceItem[]
  dueAt?: Date
  repName?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type SfB2bInvoiceStatus = 'paid' | 'overdue' | 'open'

export type SfB2bInvoiceJson = {
  id: string
  outletName: string
  invoiceNumber: string
  invoiceAt: string | null
  amountGhs: number
  discountGhs: number
  paidGhs: number
  balanceGhs: number
  paymentMethod: SfB2bPaymentMethod | null
  items: SfB2bInvoiceItem[]
  dueAt: string | null
  repName: string | null
  status: SfB2bInvoiceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

function statusFor(
  doc: Pick<SfB2bInvoiceDoc, 'amountGhs' | 'paidGhs' | 'dueAt' | 'discountGhs'>,
  now: Date,
) {
  const amount = Number(doc.amountGhs) || 0
  const discount = Math.max(0, Math.min(amount, Number(doc.discountGhs) || 0))
  const net = Math.max(0, amount - discount)
  const paid = Number(doc.paidGhs) || 0
  const balance = Math.max(0, net - paid)
  if (balance <= 0) return { status: 'paid' as const, balanceGhs: 0 }
  if (doc.dueAt && doc.dueAt.getTime() < now.getTime()) {
    return { status: 'overdue' as const, balanceGhs: balance }
  }
  return { status: 'open' as const, balanceGhs: balance }
}

export function serializeSfB2bInvoice(doc: SfB2bInvoiceDoc, now = new Date()): SfB2bInvoiceJson {
  const { status, balanceGhs } = statusFor(doc, now)
  return {
    id: doc._id.toHexString(),
    outletName: doc.outletName,
    invoiceNumber: doc.invoiceNumber,
    invoiceAt: doc.invoiceAt ? doc.invoiceAt.toISOString() : null,
    amountGhs: doc.amountGhs,
    discountGhs: Number.isFinite(doc.discountGhs as number) ? (doc.discountGhs as number) : 0,
    paidGhs: doc.paidGhs,
    balanceGhs,
    paymentMethod: doc.paymentMethod ?? null,
    items: Array.isArray(doc.items) ? doc.items : [],
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    repName: doc.repName ?? null,
    status,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function invoicesCollection(db: Db) {
  return db.collection<WithoutId<SfB2bInvoiceDoc>>(SF_B2B_INVOICES_COLLECTION)
}

export async function listSfB2bInvoices(db: Db): Promise<SfB2bInvoiceDoc[]> {
  const rows = await invoicesCollection(db)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as SfB2bInvoiceDoc)
}

export type CreateSfB2bInvoiceInput = {
  outletName: string
  invoiceNumber: string
  invoiceAt?: Date
  amountGhs: number
  discountGhs?: number
  paidGhs: number
  paymentMethod?: SfB2bPaymentMethod
  items?: SfB2bInvoiceItem[]
  dueAt?: Date
  repName?: string
  notes?: string
}

export async function createSfB2bInvoice(
  db: Db,
  input: CreateSfB2bInvoiceInput,
): Promise<SfB2bInvoiceDoc> {
  const now = new Date()
  const discount = Math.max(0, Math.min(input.amountGhs, input.discountGhs ?? 0))
  const doc: WithoutId<SfB2bInvoiceDoc> = {
    outletName: input.outletName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceAt: input.invoiceAt,
    amountGhs: input.amountGhs,
    discountGhs: discount > 0 ? discount : undefined,
    paidGhs: input.paidGhs,
    paymentMethod: input.paymentMethod,
    items: input.items?.map((it) => ({
      name: it.name.trim(),
      sku: it.sku?.trim() ? it.sku.trim() : undefined,
      qty: it.qty,
      unitPriceGhs: it.unitPriceGhs,
    })),
    dueAt: input.dueAt,
    repName: input.repName?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await invoicesCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSfB2bInvoiceInput = Partial<{
  outletName: string
  invoiceNumber: string
  invoiceAt: Date | null
  amountGhs: number
  discountGhs: number | null
  paidGhs: number
  paymentMethod: SfB2bPaymentMethod | null
  items: SfB2bInvoiceItem[] | null
  dueAt: Date | null
  repName: string | null
  notes: string | null
}>

export async function updateSfB2bInvoice(
  db: Db,
  id: ObjectId,
  patch: UpdateSfB2bInvoiceInput,
): Promise<SfB2bInvoiceDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.outletName !== undefined) $set.outletName = patch.outletName.trim()
  if (patch.invoiceNumber !== undefined) $set.invoiceNumber = patch.invoiceNumber.trim()
  if (patch.invoiceAt !== undefined) $set.invoiceAt = patch.invoiceAt ?? undefined
  if (patch.amountGhs !== undefined) $set.amountGhs = patch.amountGhs
  if (patch.discountGhs !== undefined) $set.discountGhs = patch.discountGhs ?? undefined
  if (patch.paidGhs !== undefined) $set.paidGhs = patch.paidGhs
  if (patch.paymentMethod !== undefined) $set.paymentMethod = patch.paymentMethod ?? undefined
  if (patch.items !== undefined) {
    $set.items =
      patch.items == null
        ? undefined
        : patch.items.map((it) => ({
            name: it.name.trim(),
            sku: it.sku?.trim() ? it.sku.trim() : undefined,
            qty: it.qty,
            unitPriceGhs: it.unitPriceGhs,
          }))
  }
  if (patch.dueAt !== undefined) $set.dueAt = patch.dueAt ?? undefined
  if (patch.repName !== undefined) $set.repName = patch.repName ? patch.repName.trim() : undefined
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  const res = await invoicesCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfB2bInvoiceDoc | null
}

export async function deleteSfB2bInvoice(db: Db, id: ObjectId): Promise<boolean> {
  const res = await invoicesCollection(db).deleteOne({ _id: id })
  return res.deletedCount === 1
}

export function computeInvoiceKpis(rows: SfB2bInvoiceDoc[], now = new Date()) {
  let amount = 0
  let paid = 0
  let balance = 0
  let overdue = 0
  for (const r of rows) {
    const discount = Math.max(0, Math.min(r.amountGhs, r.discountGhs ?? 0))
    const net = Math.max(0, r.amountGhs - discount)
    amount += net
    paid += r.paidGhs
    const b = Math.max(0, net - r.paidGhs)
    balance += b
    if (b > 0 && r.dueAt && r.dueAt.getTime() < now.getTime()) overdue += b
  }
  const collectionRatePct =
    amount > 0 ? Math.min(999.9, Math.round((paid / amount) * 1000) / 10) : null
  return {
    invoicedGhs: amount,
    paidGhs: paid,
    outstandingGhs: balance,
    overdueGhs: overdue,
    collectionRatePct,
    totalInvoices: rows.length,
  }
}

