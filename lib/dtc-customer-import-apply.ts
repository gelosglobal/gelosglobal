import { type Db } from 'mongodb'
import { z } from 'zod'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

const sourceSchema = z.enum(['walk_in', 'instagram', 'web', 'referral', 'sales_rep', 'other'])
const segmentSchema = z.enum(['High LTV', 'At risk', 'New (30d)', 'Core'])

const optionalDate = z.preprocess((val) => {
  if (val == null || val === '') return undefined
  if (val instanceof Date) return val
  const d = new Date(String(val))
  return Number.isNaN(d.getTime()) ? undefined : d
}, z.date().optional())

/** Excel often gives numbers as strings; strip junk so a whole batch doesn’t fail. */
const optInt = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (v == null || v === '' || (typeof v === 'string' && v.trim() === '')) return undefined
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
      const n = Math.trunc(Number(String(v).replace(/[^0-9.\-]/g, '')))
      return Number.isFinite(n) ? n : undefined
    },
    z.number().int().min(min).max(max).optional(),
  )

const optFloat = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (v == null || v === '' || (typeof v === 'string' && v.trim() === '')) return undefined
      if (typeof v === 'number' && Number.isFinite(v)) return v
      const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
      return Number.isFinite(n) ? n : undefined
    },
    z.number().min(min).max(max).optional(),
  )

/** Bad/missing email from a wide sheet should not block the import. */
const optEmail = z.preprocess(
  (v) => {
    if (v == null || v === '' || (typeof v === 'string' && v.trim() === '')) return undefined
    const s = String(v).trim()
    const p = z.string().email().safeParse(s)
    return p.success ? s : undefined
  },
  z.string().email().optional(),
)

const optJoin = z.preprocess(
  (v) => {
    if (v == null || v === '' || (typeof v === 'string' && v.trim() === '')) return undefined
    return String(v).trim()
  },
  z.string().min(1).max(200).optional(),
)

export const dtcImportRowSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  phone: z.preprocess(
    (v) => (v == null || v === '' || v === undefined ? undefined : String(v).trim().slice(0, 40)),
    z.string().min(0).max(40).optional(),
  ),
  email: optEmail,
  location: z.string().trim().min(0).max(200).optional(),
  source: sourceSchema.optional(),
  joinDate: optJoin,
  segment: segmentSchema.optional(),
  riderAssigned: z.string().trim().min(0).max(120).optional(),
  amountToBeCollectedGhs: z.number().optional(),
  acCashCollectedGhs: z.number().optional(),
  acMomoGhs: z.number().optional(),
  acPaystackGhs: z.number().optional(),
  remarks: z.string().trim().min(0).max(2000).optional(),
  importTotalOrders: optInt(0, 10_000_000),
  importTotalBilledGhs: optFloat(0, 1_000_000_000),
  importTotalCollectedGhs: optFloat(0, 1_000_000_000),
  importReturnedGhs: optFloat(0, 1_000_000_000),
  importReturnedCount: optInt(0, 100_000_000),
  importFirstOrderAt: optionalDate,
  importLastOrderAt: optionalDate,
  /**
   * 0-based line in the import batch. With `customer`+`phone`, makes every file row a distinct
   * document so duplicate names (and duplicate name+phone) are all kept.
   */
  importRowIndex: z.number().int().min(0).max(2_000_000).optional(),
})

export type DtcImportRow = z.infer<typeof dtcImportRowSchema>

export const dtcImportBodySchema = z.object({
  rows: z.array(dtcImportRowSchema).min(1).max(800),
  replaceIntelFields: z.boolean().optional(),
})

const intelVal = <T,>(v: T | undefined | null, wipe: boolean): T | null | undefined => {
  if (wipe) {
    if (v === undefined || v === null) return null
    return v
  }
  if (v === undefined || v === null) return undefined
  return v
}

function phoneKey(phone: string | undefined) {
  return (phone ?? '').trim().slice(0, 40)
}

/**
 * One row per (customer, phone) when `importRowIndex` is absent (manual / legacy).
 * When `importRowIndex` is set (file import), one document per file line even if name+phone repeat.
 */
function upsertFilterForRow(r: DtcImportRow) {
  const p = phoneKey(r.phone)
  if (r.importRowIndex !== undefined && r.importRowIndex !== null) {
    return { customer: r.customer, phone: p, importRowIndex: r.importRowIndex }
  }
  return { customer: r.customer, phone: p }
}

/** Applies validation + `bulkWrite` upsert for DTC customers (up to 800 rows per call). */
export async function applyDtcCustomerImport(
  db: Db,
  rows: DtcImportRow[],
  replaceIntelFields: boolean,
) {
  const now = new Date()
  const wipe = replaceIntelFields === true

  const ops = rows.map((r) => ({
    updateOne: {
      filter: upsertFilterForRow(r),
      update: {
        $setOnInsert: { createdAt: now },
        $set: {
          updatedAt: now,
          customer: r.customer,
          phone: phoneKey(r.phone),
          email: r.email ?? '',
          location: r.location ?? '',
          source: r.source ?? 'other',
          joinDate: r.joinDate ? new Date(r.joinDate) : now,
          segment: r.segment ?? undefined,
          riderAssigned: r.riderAssigned ?? undefined,
          amountToBeCollectedGhs: r.amountToBeCollectedGhs ?? undefined,
          acCashCollectedGhs: r.acCashCollectedGhs ?? undefined,
          acMomoGhs: r.acMomoGhs ?? undefined,
          acPaystackGhs: r.acPaystackGhs ?? undefined,
          remarks: r.remarks ?? undefined,
          importTotalOrders: intelVal(r.importTotalOrders, wipe),
          importTotalBilledGhs: intelVal(r.importTotalBilledGhs, wipe),
          importTotalCollectedGhs: intelVal(r.importTotalCollectedGhs, wipe),
          importReturnedGhs: intelVal(r.importReturnedGhs, wipe),
          importReturnedCount: intelVal(r.importReturnedCount, wipe),
          importFirstOrderAt: intelVal(r.importFirstOrderAt, wipe),
          importLastOrderAt: intelVal(r.importLastOrderAt, wipe),
          ...(r.importRowIndex !== undefined && r.importRowIndex !== null
            ? { importRowIndex: r.importRowIndex }
            : {}),
        },
      },
      upsert: true,
    },
  }))

  return db.collection(DTC_CUSTOMERS_COLLECTION).bulkWrite(ops, { ordered: false })
}
