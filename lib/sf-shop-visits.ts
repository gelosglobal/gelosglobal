import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { endOfDay, startOfDay } from 'date-fns'
import {
  SF_VISITS_COLLECTION,
  type SfVisitDoc,
  type SfVisitStatus,
  type SfVisitType,
} from '@/lib/sf-dashboard'

export type { SfVisitStatus, SfVisitType } from '@/lib/sf-dashboard'

export type SfShopVisitJson = {
  id: string
  outletName: string
  area: string | null
  repName: string
  status: SfVisitStatus
  scheduledAt: string | null
  visitedAt: string | null
  sellInGhs: number | null
  visitType: SfVisitType | null
  durationMinutes: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

function visitsCollection(db: Db) {
  return db.collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
}

export function serializeShopVisit(doc: SfVisitDoc): SfShopVisitJson {
  return {
    id: doc._id.toHexString(),
    outletName: doc.outletName,
    area: doc.area ?? null,
    repName: doc.repName,
    status: doc.status,
    scheduledAt: doc.scheduledAt?.toISOString() ?? null,
    visitedAt: doc.visitedAt?.toISOString() ?? null,
    sellInGhs: doc.sellInGhs ?? null,
    visitType: doc.visitType ?? null,
    durationMinutes: doc.durationMinutes ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export type ListShopVisitsFilter = {
  status?: SfVisitStatus
}

export async function listShopVisits(
  db: Db,
  filter?: ListShopVisitsFilter,
): Promise<SfVisitDoc[]> {
  const q: Record<string, unknown> = {}
  if (filter?.status) q.status = filter.status
  const rows = await visitsCollection(db)
    .find(q)
    .sort({ updatedAt: -1 })
    .limit(3000)
    .toArray()
  return rows.map((r) => r as SfVisitDoc)
}

export type ShopVisitStats = {
  total: number
  scheduled: number
  completed: number
  cancelled: number
  sellInGhs: number
  rangeFrom: string | null
  rangeTo: string | null
}

export type ShopVisitStatsRange = {
  start: Date
  end: Date
}

/** Date used to include a visit in the page date range (inclusive). */
export function visitDateForRangeFilter(doc: SfVisitDoc): Date | null {
  if (doc.status === 'completed') {
    return doc.visitedAt ?? doc.scheduledAt ?? doc.updatedAt ?? doc.createdAt
  }
  if (doc.status === 'scheduled') {
    return doc.scheduledAt ?? doc.createdAt
  }
  return doc.visitedAt ?? doc.scheduledAt ?? doc.updatedAt ?? doc.createdAt
}

export function filterShopVisitsByRange(
  rows: SfVisitDoc[],
  range: ShopVisitStatsRange,
): SfVisitDoc[] {
  const rangeStart = startOfDay(range.start)
  const rangeEnd = endOfDay(range.end)
  return rows.filter((r) => {
    const d = visitDateForRangeFilter(r)
    if (!d) return false
    return d >= rangeStart && d <= rangeEnd
  })
}

export function computeShopVisitStats(rows: SfVisitDoc[]): ShopVisitStats {
  let scheduled = 0
  let completed = 0
  let cancelled = 0
  let sellInGhs = 0
  for (const r of rows) {
    if (r.status === 'scheduled') scheduled += 1
    else if (r.status === 'completed') {
      completed += 1
      sellInGhs += r.sellInGhs ?? 0
    } else if (r.status === 'cancelled') cancelled += 1
  }
  return {
    total: rows.length,
    scheduled,
    completed,
    cancelled,
    sellInGhs,
    rangeFrom: null,
    rangeTo: null,
  }
}

export function computeShopVisitStatsForRange(
  rows: SfVisitDoc[],
  range: ShopVisitStatsRange,
): ShopVisitStats {
  const inRange = filterShopVisitsByRange(rows, range)
  const stats = computeShopVisitStats(inRange)
  const rangeStart = startOfDay(range.start)
  const rangeEnd = endOfDay(range.end)
  return {
    ...stats,
    rangeFrom: rangeStart.toISOString(),
    rangeTo: rangeEnd.toISOString(),
  }
}

export type CreateShopVisitInput = {
  outletName: string
  area?: string
  repName: string
  status: SfVisitStatus
  scheduledAt?: Date
  visitedAt?: Date
  sellInGhs?: number
  visitType?: SfVisitType
  durationMinutes?: number
  notes?: string
}

export async function createShopVisit(
  db: Db,
  input: CreateShopVisitInput,
): Promise<SfVisitDoc> {
  const now = new Date()
  const doc: WithoutId<SfVisitDoc> = {
    outletName: input.outletName.trim(),
    area: input.area?.trim() || undefined,
    repName: input.repName.trim(),
    status: input.status,
    scheduledAt: input.scheduledAt,
    visitedAt: input.visitedAt,
    sellInGhs: input.sellInGhs,
    visitType: input.visitType,
    durationMinutes: input.durationMinutes,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await visitsCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateShopVisitInput = Partial<{
  outletName: string
  area: string | null
  repName: string
  status: SfVisitStatus
  scheduledAt: Date | null
  visitedAt: Date | null
  sellInGhs: number | null
  visitType: SfVisitType | null
  durationMinutes: number | null
  notes: string | null
}>

export async function updateShopVisit(
  db: Db,
  id: ObjectId,
  patch: UpdateShopVisitInput,
): Promise<SfVisitDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.outletName !== undefined) $set.outletName = patch.outletName.trim()
  if (patch.area !== undefined) {
    $set.area =
      patch.area === null || patch.area === '' ? null : patch.area.trim()
  }
  if (patch.repName !== undefined) $set.repName = patch.repName.trim()
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.scheduledAt !== undefined) {
    $set.scheduledAt = patch.scheduledAt ?? null
  }
  if (patch.visitedAt !== undefined) {
    $set.visitedAt = patch.visitedAt ?? null
  }
  if (patch.sellInGhs !== undefined) {
    $set.sellInGhs = patch.sellInGhs ?? null
  }
  if (patch.visitType !== undefined) {
    $set.visitType = patch.visitType ?? null
  }
  if (patch.durationMinutes !== undefined) {
    $set.durationMinutes = patch.durationMinutes ?? null
  }
  if (patch.notes !== undefined) {
    $set.notes = patch.notes === null || patch.notes === '' ? null : patch.notes.trim()
  }

  const res = await visitsCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfVisitDoc | null
}

export async function deleteShopVisit(db: Db, id: ObjectId): Promise<boolean> {
  const r = await visitsCollection(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}
