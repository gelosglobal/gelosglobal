import type { Db, WithoutId } from 'mongodb'

export const SELL_IN_EXPENSE_ACCOUNT_BUDGETS_COLLECTION = 'sell_in_expense_account_budgets'

/** Month key in the form YYYY-MM (e.g. 2026-04). */
export type SellInExpenseMonthKey = string

export type SellInExpenseAccountBudgetDoc = {
  _id: string
  month: SellInExpenseMonthKey
  accountId: string
  budgetGhs: number
  updatedAt: Date
}

export type SellInExpenseAccountBudgetJson = {
  month: SellInExpenseMonthKey
  accountId: string
  budgetGhs: number
  updatedAt: string
}

export function serializeSellInExpenseAccountBudget(
  doc: SellInExpenseAccountBudgetDoc,
): SellInExpenseAccountBudgetJson {
  return {
    month: doc.month,
    accountId: doc.accountId,
    budgetGhs: doc.budgetGhs,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function col(db: Db) {
  return db.collection<WithoutId<SellInExpenseAccountBudgetDoc>>(
    SELL_IN_EXPENSE_ACCOUNT_BUDGETS_COLLECTION,
  )
}

function idFor(month: SellInExpenseMonthKey, accountId: string) {
  return `month:${month}:acct:${accountId}`
}

export async function getOrCreateAccountBudget(
  db: Db,
  month: SellInExpenseMonthKey,
  accountId: string,
): Promise<SellInExpenseAccountBudgetDoc> {
  const _id = idFor(month, accountId)
  const existing = await col(db).findOne({ _id })
  if (existing) return existing as SellInExpenseAccountBudgetDoc
  const now = new Date()
  const doc: SellInExpenseAccountBudgetDoc = {
    _id,
    month,
    accountId,
    budgetGhs: 0,
    updatedAt: now,
  }
  await col(db).insertOne(doc)
  return doc
}

export async function setAccountBudget(
  db: Db,
  month: SellInExpenseMonthKey,
  accountId: string,
  budgetGhs: number,
): Promise<SellInExpenseAccountBudgetDoc> {
  await getOrCreateAccountBudget(db, month, accountId)
  const now = new Date()
  const _id = idFor(month, accountId)
  const res = await col(db).findOneAndUpdate(
    { _id },
    {
      $set: {
        month,
        accountId,
        budgetGhs: Math.max(0, Math.min(1_000_000_000, budgetGhs)),
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  )
  return (res as SellInExpenseAccountBudgetDoc) ?? (await getOrCreateAccountBudget(db, month, accountId))
}

export async function listAccountBudgetsForMonth(
  db: Db,
  month: SellInExpenseMonthKey,
): Promise<SellInExpenseAccountBudgetDoc[]> {
  const rows = await col(db).find({ month }).limit(5000).toArray()
  return rows.map((r) => r as SellInExpenseAccountBudgetDoc)
}

