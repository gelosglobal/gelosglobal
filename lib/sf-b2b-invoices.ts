import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_B2B_INVOICES_COLLECTION = 'sf_b2b_invoices'

export type SfB2bInvoiceDoc = {
  _id: ObjectId
  outletName: string
  invoiceNumber: string
  amountGhs: number
  paidGhs: number
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
  amountGhs: number
  paidGhs: number
  balanceGhs: number
  dueAt: string | null
  repName: string | null
  status: SfB2bInvoiceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

function statusFor(doc: Pick<SfB2bInvoiceDoc, 'amountGhs' | 'paidGhs' | 'dueAt'>, now: Date) {
  const balance = Math.max(0, (doc.amountGhs ?? 0) - (doc.paidGhs ?? 0))
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
    amountGhs: doc.amountGhs,
    paidGhs: doc.paidGhs,
    balanceGhs,
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
  amountGhs: number
  paidGhs: number
  dueAt?: Date
  repName?: string
  notes?: string
}

export async function createSfB2bInvoice(
  db: Db,
  input: CreateSfB2bInvoiceInput,
): Promise<SfB2bInvoiceDoc> {
  const now = new Date()
  const doc: WithoutId<SfB2bInvoiceDoc> = {
    outletName: input.outletName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    amountGhs: input.amountGhs,
    paidGhs: input.paidGhs,
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
  amountGhs: number
  paidGhs: number
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
  if (patch.amountGhs !== undefined) $set.amountGhs = patch.amountGhs
  if (patch.paidGhs !== undefined) $set.paidGhs = patch.paidGhs
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
    amount += r.amountGhs
    paid += r.paidGhs
    const b = Math.max(0, r.amountGhs - r.paidGhs)
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

