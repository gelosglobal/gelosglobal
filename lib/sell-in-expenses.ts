import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { startOfMonth, addMonths } from 'date-fns'

export const SELL_IN_EXPENSES_COLLECTION = 'sell_in_expenses'

/** Month key in the form YYYY-MM (e.g. 2026-04). */
export type SellInExpenseMonthKey = string

export type SellInExpenseCategory =
  | 'shipping'
  | 'customs'
  | 'storage'
  | 'logistics'
  | 'marketing'
  | 'samples'
  | 'other'

export type SellInExpensePaymentMethod =
  | 'cash'
  | 'momo'
  | 'bank_transfer'
  | 'cheque'
  | 'card'
  | 'other'

export type SellInExpenseStatus = 'pending' | 'paid'

export type SellInExpenseDoc = {
  _id: ObjectId
  occurredAt: Date
  amountGhs: number
  category: SellInExpenseCategory
  description: string
  accountId: string
  accountName?: string
  paymentMethod?: SellInExpensePaymentMethod
  status?: SellInExpenseStatus
  paidBy?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type SellInExpenseJson = {
  id: string
  occurredAt: string
  amountGhs: number
  category: SellInExpenseCategory
  description: string
  accountId: string
  accountName: string | null
  paymentMethod: SellInExpensePaymentMethod | null
  status: SellInExpenseStatus | null
  paidBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export function serializeSellInExpense(doc: SellInExpenseDoc): SellInExpenseJson {
  return {
    id: doc._id.toHexString(),
    occurredAt: doc.occurredAt.toISOString(),
    amountGhs: doc.amountGhs,
    category: doc.category,
    description: doc.description,
    accountId: doc.accountId,
    accountName: doc.accountName ?? null,
    paymentMethod: doc.paymentMethod ?? null,
    status: doc.status ?? null,
    paidBy: doc.paidBy ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function col(db: Db) {
  return db.collection<WithoutId<SellInExpenseDoc>>(SELL_IN_EXPENSES_COLLECTION)
}

export type CreateSellInExpenseInput = {
  accountId: string
  accountName?: string
  occurredAt: Date
  amountGhs: number
  category: SellInExpenseCategory
  description: string
  paymentMethod?: SellInExpensePaymentMethod
  status?: SellInExpenseStatus
  paidBy?: string
  notes?: string
}

export async function createSellInExpense(
  db: Db,
  input: CreateSellInExpenseInput,
): Promise<SellInExpenseDoc> {
  const now = new Date()
  const doc: WithoutId<SellInExpenseDoc> = {
    accountId: input.accountId,
    accountName: input.accountName?.trim() || undefined,
    occurredAt: input.occurredAt,
    amountGhs: Math.max(0, Math.min(1_000_000_000, input.amountGhs)),
    category: input.category,
    description: input.description.trim(),
    paymentMethod: input.paymentMethod,
    status: input.status,
    paidBy: input.paidBy?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await col(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSellInExpenseInput = Partial<{
  accountId: string
  accountName: string | null
  occurredAt: Date
  amountGhs: number
  category: SellInExpenseCategory
  description: string
  paymentMethod: SellInExpensePaymentMethod | null
  status: SellInExpenseStatus | null
  paidBy: string | null
  notes: string | null
}>

export async function updateSellInExpense(
  db: Db,
  id: ObjectId,
  patch: UpdateSellInExpenseInput,
): Promise<SellInExpenseDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.accountId !== undefined) $set.accountId = patch.accountId
  if (patch.accountName !== undefined) $set.accountName = patch.accountName ? patch.accountName.trim() : undefined
  if (patch.occurredAt !== undefined) $set.occurredAt = patch.occurredAt
  if (patch.amountGhs !== undefined) $set.amountGhs = Math.max(0, Math.min(1_000_000_000, patch.amountGhs))
  if (patch.category !== undefined) $set.category = patch.category
  if (patch.description !== undefined) $set.description = patch.description.trim()
  if (patch.paymentMethod !== undefined) $set.paymentMethod = patch.paymentMethod ?? undefined
  if (patch.status !== undefined) $set.status = patch.status ?? undefined
  if (patch.paidBy !== undefined) $set.paidBy = patch.paidBy ? patch.paidBy.trim() : undefined
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  const res = await col(db).findOneAndUpdate({ _id: id }, { $set }, { returnDocument: 'after' })
  return res as SellInExpenseDoc | null
}

export async function deleteSellInExpense(db: Db, id: ObjectId): Promise<boolean> {
  const r = await col(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}

export async function listSellInExpenses(db: Db): Promise<SellInExpenseDoc[]> {
  const rows = await col(db)
    .find({})
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(3000)
    .toArray()
  return rows.map((r) => r as SellInExpenseDoc)
}

function monthKeyToRange(month: SellInExpenseMonthKey) {
  const [yRaw, mRaw] = month.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const start = startOfMonth(new Date(y, Math.max(0, m - 1), 1))
  const end = addMonths(start, 1)
  return { start, end }
}

export async function listSellInExpensesForMonth(
  db: Db,
  month: SellInExpenseMonthKey,
): Promise<SellInExpenseDoc[]> {
  const { start, end } = monthKeyToRange(month)
  const rows = await col(db)
    .find({ occurredAt: { $gte: start, $lt: end } })
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(3000)
    .toArray()
  return rows.map((r) => r as SellInExpenseDoc)
}

