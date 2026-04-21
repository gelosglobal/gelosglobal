import type { Db, WithoutId } from 'mongodb'

export const SELL_IN_EXPENSE_BUDGETS_COLLECTION = 'sell_in_expense_budgets'

/** Month key in the form YYYY-MM (e.g. 2026-04). */
export type SellInExpenseMonthKey = string

export type SellInExpenseBudgetDoc = {
  _id: string
  month: SellInExpenseMonthKey
  budgetGhs: number
  updatedAt: Date
}

export type SellInExpenseBudgetJson = {
  month: SellInExpenseMonthKey
  budgetGhs: number
  updatedAt: string
}

export function serializeSellInExpenseBudget(
  doc: SellInExpenseBudgetDoc,
): SellInExpenseBudgetJson {
  return {
    month: doc.month,
    budgetGhs: doc.budgetGhs,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function col(db: Db) {
  return db.collection<WithoutId<SellInExpenseBudgetDoc>>(
    SELL_IN_EXPENSE_BUDGETS_COLLECTION,
  )
}

export async function getOrCreateSellInExpenseBudget(
  db: Db,
  month: SellInExpenseMonthKey,
): Promise<SellInExpenseBudgetDoc> {
  const id = `month:${month}`
  const existing = await col(db).findOne({ _id: id })
  if (existing) return existing as SellInExpenseBudgetDoc
  const now = new Date()
  const doc: SellInExpenseBudgetDoc = {
    _id: id,
    month,
    budgetGhs: 0,
    updatedAt: now,
  }
  await col(db).insertOne(doc)
  return doc
}

export async function setSellInExpenseBudget(
  db: Db,
  month: SellInExpenseMonthKey,
  budgetGhs: number,
): Promise<SellInExpenseBudgetDoc> {
  await getOrCreateSellInExpenseBudget(db, month)
  const now = new Date()
  const id = `month:${month}`
  const res = await col(db).findOneAndUpdate(
    { _id: id },
    {
      $set: {
        month,
        budgetGhs: Math.max(0, Math.min(1_000_000_000, budgetGhs)),
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  )
  return (res as SellInExpenseBudgetDoc) ?? (await getOrCreateSellInExpenseBudget(db, month))
}

