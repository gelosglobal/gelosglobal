import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_B2B_INVOICES_COLLECTION = 'sf_b2b_invoices'

export type SfB2bPaymentMethod = 'momo' | 'cash' | 'bank_transfer' | 'cheque'

export type SfB2bInvoiceItem = {
  name: string
  sku?: string
  qty: number
  unitPriceGhs: number
  /** Optional unit cost (for margin calculations). */
  unitCostGhs?: number
  /** `sf_inventory` row id when the line reduces retail stock. */
  inventoryItemId?: string
}

/** One receipt against an invoice (supports partial payments across months). */
export type SfB2bInvoicePaymentEvent = {
  id: string
  amountGhs: number
  paidAt: Date
  paymentMethod?: SfB2bPaymentMethod
  note?: string
  createdAt: Date
}

export type SfB2bInvoicePaymentEventJson = {
  id: string
  amountGhs: number
  paidAt: string
  paymentMethod: SfB2bPaymentMethod | null
  note: string | null
  createdAt: string
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
  /** Latest payment date (derived from `payments` when present). */
  paidAt?: Date
  paymentMethod?: SfB2bPaymentMethod
  /** Partial / installment receipts; `paidGhs` is the sum of these. */
  payments?: SfB2bInvoicePaymentEvent[]
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
  paidAt: string | null
  balanceGhs: number
  paymentMethod: SfB2bPaymentMethod | null
  payments: SfB2bInvoicePaymentEventJson[]
  items: SfB2bInvoiceItem[]
  dueAt: string | null
  repName: string | null
  status: SfB2bInvoiceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export function normalizeInvoicePayments(
  doc: Pick<SfB2bInvoiceDoc, 'payments' | 'paidGhs' | 'paidAt' | 'paymentMethod' | 'createdAt'>,
): SfB2bInvoicePaymentEvent[] {
  const raw = Array.isArray(doc.payments) ? doc.payments : []
  const cleaned: SfB2bInvoicePaymentEvent[] = []
  for (const p of raw) {
    const amount = Number(p.amountGhs) || 0
    if (amount <= 0) continue
    const paidAt = p.paidAt instanceof Date ? p.paidAt : new Date(p.paidAt)
    if (Number.isNaN(paidAt.getTime())) continue
    const createdRaw =
      p.createdAt instanceof Date
        ? p.createdAt
        : p.createdAt
          ? new Date(p.createdAt)
          : paidAt
    cleaned.push({
      id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : new ObjectId().toHexString(),
      amountGhs: amount,
      paidAt,
      paymentMethod: p.paymentMethod,
      note: typeof p.note === 'string' && p.note.trim() ? p.note.trim() : undefined,
      createdAt: Number.isNaN(createdRaw.getTime()) ? paidAt : createdRaw,
    })
  }
  cleaned.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())

  if (cleaned.length > 0) return cleaned

  const paid = Number(doc.paidGhs) || 0
  if (paid <= 0) return []
  const paidAt = doc.paidAt ?? doc.createdAt ?? new Date()
  return [
    {
      /** Stable id so serialize/add/remove agree before the row is migrated. */
      id: 'legacy',
      amountGhs: paid,
      paidAt,
      paymentMethod: doc.paymentMethod,
      createdAt: paidAt,
    },
  ]
}

export function derivePaidFromPayments(payments: SfB2bInvoicePaymentEvent[]): {
  paidGhs: number
  paidAt?: Date
  paymentMethod?: SfB2bPaymentMethod
} {
  if (payments.length === 0) return { paidGhs: 0 }
  let paidGhs = 0
  let latest = payments[0]!
  for (const p of payments) {
    paidGhs += p.amountGhs
    if (p.paidAt.getTime() >= latest.paidAt.getTime()) latest = p
  }
  return {
    paidGhs,
    paidAt: latest.paidAt,
    paymentMethod: latest.paymentMethod,
  }
}

function serializePayment(p: SfB2bInvoicePaymentEvent): SfB2bInvoicePaymentEventJson {
  return {
    id: p.id,
    amountGhs: p.amountGhs,
    paidAt: p.paidAt.toISOString(),
    paymentMethod: p.paymentMethod ?? null,
    note: p.note ?? null,
    createdAt: p.createdAt.toISOString(),
  }
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
  const payments = normalizeInvoicePayments(doc)
  const derived = derivePaidFromPayments(payments)
  const paidGhs = payments.length > 0 ? derived.paidGhs : Number(doc.paidGhs) || 0
  const docForStatus = { ...doc, paidGhs }
  const { status, balanceGhs } = statusFor(docForStatus, now)
  const paidAt = derived.paidAt ?? doc.paidAt
  return {
    id: doc._id.toHexString(),
    outletName: doc.outletName,
    invoiceNumber: doc.invoiceNumber,
    invoiceAt: doc.invoiceAt ? doc.invoiceAt.toISOString() : null,
    amountGhs: doc.amountGhs,
    discountGhs: Number.isFinite(doc.discountGhs as number) ? (doc.discountGhs as number) : 0,
    paidGhs,
    paidAt: paidAt ? paidAt.toISOString() : null,
    balanceGhs,
    paymentMethod: derived.paymentMethod ?? doc.paymentMethod ?? null,
    payments: payments.map(serializePayment),
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
    /** `createdAt` keeps row order stable after edits; `updatedAt` would jump edited rows to the top. */
    .sort({ createdAt: -1, _id: -1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as SfB2bInvoiceDoc)
}

export async function getSfB2bInvoiceById(db: Db, id: ObjectId): Promise<SfB2bInvoiceDoc | null> {
  const doc = await invoicesCollection(db).findOne({ _id: id })
  return doc ? (doc as SfB2bInvoiceDoc) : null
}

export type CreateSfB2bInvoiceInput = {
  outletName: string
  invoiceNumber: string
  invoiceAt?: Date
  amountGhs: number
  discountGhs?: number
  paidGhs: number
  paidAt?: Date
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
  const paidGhs = Math.max(0, input.paidGhs)
  const payments: SfB2bInvoicePaymentEvent[] =
    paidGhs > 0
      ? [
          {
            id: new ObjectId().toHexString(),
            amountGhs: paidGhs,
            paidAt: input.paidAt ?? now,
            paymentMethod: input.paymentMethod,
            createdAt: now,
          },
        ]
      : []
  const derived = derivePaidFromPayments(payments)
  const doc: WithoutId<SfB2bInvoiceDoc> = {
    outletName: input.outletName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceAt: input.invoiceAt,
    amountGhs: input.amountGhs,
    discountGhs: discount > 0 ? discount : undefined,
    paidGhs: derived.paidGhs,
    paidAt: derived.paidAt,
    paymentMethod: derived.paymentMethod ?? input.paymentMethod,
    payments,
    items: input.items?.map((it) => {
      const inv = it.inventoryItemId?.trim()
      return {
        name: it.name.trim(),
        sku: it.sku?.trim() ? it.sku.trim() : undefined,
        qty: it.qty,
        unitPriceGhs: it.unitPriceGhs,
        unitCostGhs:
          typeof it.unitCostGhs === 'number' && Number.isFinite(it.unitCostGhs)
            ? it.unitCostGhs
            : undefined,
        ...(inv && ObjectId.isValid(inv) ? { inventoryItemId: inv } : {}),
      }
    }),
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
  paidAt: Date | null
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
  const existing = await getSfB2bInvoiceById(db, id)
  if (!existing) return null

  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.outletName !== undefined) $set.outletName = patch.outletName.trim()
  if (patch.invoiceNumber !== undefined) $set.invoiceNumber = patch.invoiceNumber.trim()
  if (patch.invoiceAt !== undefined) $set.invoiceAt = patch.invoiceAt ?? undefined
  if (patch.amountGhs !== undefined) $set.amountGhs = patch.amountGhs
  if (patch.discountGhs !== undefined) $set.discountGhs = patch.discountGhs ?? undefined
  if (patch.items !== undefined) {
    $set.items =
      patch.items == null
        ? undefined
        : patch.items.map((it) => {
            const inv = it.inventoryItemId?.trim()
            return {
              name: it.name.trim(),
              sku: it.sku?.trim() ? it.sku.trim() : undefined,
              qty: it.qty,
              unitPriceGhs: it.unitPriceGhs,
              unitCostGhs:
                typeof it.unitCostGhs === 'number' && Number.isFinite(it.unitCostGhs)
                  ? it.unitCostGhs
                  : undefined,
              ...(inv && ObjectId.isValid(inv) ? { inventoryItemId: inv } : {}),
            }
          })
  }
  if (patch.dueAt !== undefined) $set.dueAt = patch.dueAt ?? undefined
  if (patch.repName !== undefined) $set.repName = patch.repName ? patch.repName.trim() : undefined
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  const existingPayments = Array.isArray(existing.payments) ? existing.payments : []
  const touchingPaid =
    patch.paidGhs !== undefined ||
    patch.paidAt !== undefined ||
    patch.paymentMethod !== undefined

  if (touchingPaid) {
    // Legacy edit of total paid: replace with a single payment event so month attribution stays valid.
    // Prefer addSfB2bInvoicePayment for installment receipts.
    const nextPaid =
      patch.paidGhs !== undefined ? Math.max(0, patch.paidGhs) : Number(existing.paidGhs) || 0
    const nextPaidAt =
      patch.paidAt !== undefined
        ? patch.paidAt
        : existing.paidAt ?? existing.createdAt ?? new Date()
    const nextMethod =
      patch.paymentMethod !== undefined
        ? patch.paymentMethod ?? undefined
        : existing.paymentMethod

    if (nextPaid <= 0) {
      $set.paidGhs = 0
      $set.paidAt = undefined
      $set.paymentMethod = nextMethod
      $set.payments = []
    } else if (existingPayments.length <= 1) {
      const payments: SfB2bInvoicePaymentEvent[] = [
        {
          id: existingPayments[0]?.id ?? new ObjectId().toHexString(),
          amountGhs: nextPaid,
          paidAt: nextPaidAt ?? new Date(),
          paymentMethod: nextMethod,
          note: existingPayments[0]?.note,
          createdAt: existingPayments[0]?.createdAt ?? new Date(),
        },
      ]
      const derived = derivePaidFromPayments(payments)
      $set.payments = payments
      $set.paidGhs = derived.paidGhs
      $set.paidAt = derived.paidAt
      $set.paymentMethod = derived.paymentMethod ?? nextMethod
    } else {
      // Multiple installments already recorded — only update method/date aggregates if paid total unchanged.
      if (patch.paidGhs !== undefined && Math.abs(nextPaid - (Number(existing.paidGhs) || 0)) > 0.009) {
        // Caller tried to overwrite installment history with a new total — collapse to one event.
        const payments: SfB2bInvoicePaymentEvent[] = [
          {
            id: new ObjectId().toHexString(),
            amountGhs: nextPaid,
            paidAt: nextPaidAt ?? new Date(),
            paymentMethod: nextMethod,
            createdAt: new Date(),
          },
        ]
        const derived = derivePaidFromPayments(payments)
        $set.payments = payments
        $set.paidGhs = derived.paidGhs
        $set.paidAt = derived.paidAt
        $set.paymentMethod = derived.paymentMethod ?? nextMethod
      } else {
        if (patch.paymentMethod !== undefined) $set.paymentMethod = nextMethod
        if (patch.paidAt !== undefined) $set.paidAt = nextPaidAt ?? undefined
      }
    }
  }

  const res = await invoicesCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfB2bInvoiceDoc | null
}

export type AddSfB2bInvoicePaymentInput = {
  amountGhs: number
  paidAt: Date
  paymentMethod?: SfB2bPaymentMethod
  note?: string
}

export async function addSfB2bInvoicePayment(
  db: Db,
  id: ObjectId,
  input: AddSfB2bInvoicePaymentInput,
): Promise<SfB2bInvoiceDoc | null> {
  const existing = await getSfB2bInvoiceById(db, id)
  if (!existing) return null

  const amount = Math.max(0, input.amountGhs)
  if (amount <= 0) return existing

  const payments = normalizeInvoicePayments(existing)
  // Persist legacy single-paid as a real event before appending, so history is not invented twice.
  const now = new Date()
  const migrated = payments.map((p) =>
    p.id === 'legacy'
      ? { ...p, id: new ObjectId().toHexString() }
      : p,
  )
  migrated.push({
    id: new ObjectId().toHexString(),
    amountGhs: amount,
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod,
    note: input.note?.trim() || undefined,
    createdAt: now,
  })
  migrated.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
  const derived = derivePaidFromPayments(migrated)

  const res = await invoicesCollection(db).findOneAndUpdate(
    { _id: id },
    {
      $set: {
        payments: migrated,
        paidGhs: derived.paidGhs,
        paidAt: derived.paidAt,
        paymentMethod: derived.paymentMethod ?? existing.paymentMethod,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  )
  return res as SfB2bInvoiceDoc | null
}

export async function removeSfB2bInvoicePayment(
  db: Db,
  id: ObjectId,
  paymentId: string,
): Promise<SfB2bInvoiceDoc | null> {
  const existing = await getSfB2bInvoiceById(db, id)
  if (!existing) return null

  const payments = normalizeInvoicePayments(existing)
    .filter((p) => p.id !== paymentId)
    .map((p) =>
      p.id === 'legacy' ? { ...p, id: new ObjectId().toHexString() } : p,
    )
  const derived = derivePaidFromPayments(payments)
  const now = new Date()

  const res = await invoicesCollection(db).findOneAndUpdate(
    { _id: id },
    {
      $set: {
        payments,
        paidGhs: derived.paidGhs,
        paidAt: derived.paidAt,
        paymentMethod: derived.paymentMethod,
        updatedAt: now,
      },
    },
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

function invoiceDocDate(doc: SfB2bInvoiceDoc): Date | null {
  const raw = doc.invoiceAt ?? doc.dueAt ?? doc.createdAt
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function inInclusiveRange(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/**
 * Period-aware KPIs for B2B Payments cards.
 * - Invoiced = net of invoices **dated** in range
 * - Paid = installment amounts **received** in range
 * - Outstanding / overdue = current balances on the listed (activity-matched) rows
 */
export function computeInvoicePeriodKpis(
  rows: SfB2bInvoiceDoc[],
  opts: { start: Date; end: Date; now?: Date },
) {
  const now = opts.now ?? new Date()
  const { start, end } = opts

  let invoicedGhs = 0
  let paidGhs = 0
  let outstandingGhs = 0
  let overdueGhs = 0

  for (const r of rows) {
    const discount = Math.max(0, Math.min(r.amountGhs, r.discountGhs ?? 0))
    const net = Math.max(0, r.amountGhs - discount)
    const payments = normalizeInvoicePayments(r)
    const paidTotal =
      payments.length > 0 ? derivePaidFromPayments(payments).paidGhs : Number(r.paidGhs) || 0
    const balance = Math.max(0, net - paidTotal)
    outstandingGhs += balance
    if (balance > 0 && r.dueAt && r.dueAt.getTime() < now.getTime()) {
      overdueGhs += balance
    }

    const invDate = invoiceDocDate(r)
    if (invDate && inInclusiveRange(invDate, start, end)) {
      invoicedGhs += net
    }

    if (payments.length > 0) {
      for (const p of payments) {
        if (inInclusiveRange(p.paidAt, start, end)) {
          paidGhs += p.amountGhs
        }
      }
    } else if (paidTotal > 0) {
      const paidAt = r.paidAt ?? invDate
      if (paidAt && inInclusiveRange(paidAt instanceof Date ? paidAt : new Date(paidAt), start, end)) {
        paidGhs += paidTotal
      }
    }
  }

  const collectionRatePct =
    invoicedGhs > 0
      ? Math.min(999.9, Math.round((paidGhs / invoicedGhs) * 1000) / 10)
      : null

  return {
    invoicedGhs,
    paidGhs,
    outstandingGhs,
    overdueGhs,
    collectionRatePct,
    totalInvoices: rows.length,
  }
}

