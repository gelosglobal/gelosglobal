import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_SCOUTED_OUTLETS_COLLECTION = 'sf_scouted_outlets'

export type ScoutOutletStatus = 'lead' | 'qualified' | 'in_review' | 'won' | 'lost'

export type ScoutPriority = 'low' | 'medium' | 'high'

export type SfScoutedOutletDoc = {
  _id: ObjectId
  name: string
  area: string
  contactName?: string
  contactPhone?: string
  notes?: string
  estimatedMonthlyVolumeGhs?: number
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  scoutedAt: Date
  /** WGS84 — set from map geocode or manual PATCH. */
  latitude?: number
  longitude?: number
  createdAt: Date
  updatedAt: Date
}

export type SfScoutedOutletJson = {
  id: string
  name: string
  area: string
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  estimatedMonthlyVolumeGhs: number | null
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  scoutedAt: string
  latitude: number | null
  longitude: number | null
  createdAt: string
  updatedAt: string
}

export function serializeScoutedOutlet(doc: SfScoutedOutletDoc): SfScoutedOutletJson {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    area: doc.area,
    contactName: doc.contactName ?? null,
    contactPhone: doc.contactPhone ?? null,
    notes: doc.notes ?? null,
    estimatedMonthlyVolumeGhs: doc.estimatedMonthlyVolumeGhs ?? null,
    status: doc.status,
    priority: doc.priority,
    scoutedBy: doc.scoutedBy,
    scoutedAt: doc.scoutedAt.toISOString(),
    latitude:
      doc.latitude != null && Number.isFinite(doc.latitude) ? doc.latitude : null,
    longitude:
      doc.longitude != null && Number.isFinite(doc.longitude)
        ? doc.longitude
        : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function collection(db: Db) {
  return db.collection<WithoutId<SfScoutedOutletDoc>>(SF_SCOUTED_OUTLETS_COLLECTION)
}

export async function listScoutedOutlets(
  db: Db,
  filter?: { status?: ScoutOutletStatus },
): Promise<SfScoutedOutletDoc[]> {
  const q = filter?.status ? { status: filter.status } : {}
  const rows = await collection(db)
    .find(q)
    .sort({ scoutedAt: -1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as SfScoutedOutletDoc)
}

export type ScoutingStats = {
  total: number
  byStatus: Record<ScoutOutletStatus, number>
  pipelineOpen: number
}

export function computeScoutingStats(rows: SfScoutedOutletDoc[]): ScoutingStats {
  const byStatus: Record<ScoutOutletStatus, number> = {
    lead: 0,
    qualified: 0,
    in_review: 0,
    won: 0,
    lost: 0,
  }
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  }
  const pipelineOpen =
    byStatus.lead + byStatus.qualified + byStatus.in_review
  return { total: rows.length, byStatus, pipelineOpen }
}

export type CreateScoutedOutletInput = {
  name: string
  area: string
  contactName?: string
  contactPhone?: string
  notes?: string
  estimatedMonthlyVolumeGhs?: number
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  scoutedAt: Date
  latitude?: number
  longitude?: number
}

export async function createScoutedOutlet(
  db: Db,
  input: CreateScoutedOutletInput,
): Promise<SfScoutedOutletDoc> {
  const now = new Date()
  const doc: WithoutId<SfScoutedOutletDoc> = {
    name: input.name.trim(),
    area: input.area.trim(),
    contactName: input.contactName?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    estimatedMonthlyVolumeGhs: input.estimatedMonthlyVolumeGhs,
    status: input.status,
    priority: input.priority,
    scoutedBy: input.scoutedBy.trim(),
    scoutedAt: input.scoutedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: now,
    updatedAt: now,
  }
  const res = await collection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateScoutedOutletInput = Partial<{
  name: string
  area: string
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  estimatedMonthlyVolumeGhs: number | null
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  scoutedAt: Date
  latitude: number | null
  longitude: number | null
}>

export async function updateScoutedOutlet(
  db: Db,
  id: ObjectId,
  patch: UpdateScoutedOutletInput,
): Promise<SfScoutedOutletDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.area !== undefined) $set.area = patch.area.trim()
  if (patch.contactName !== undefined) {
    $set.contactName =
      patch.contactName === null || patch.contactName === ''
        ? null
        : patch.contactName.trim()
  }
  if (patch.contactPhone !== undefined) {
    $set.contactPhone =
      patch.contactPhone === null || patch.contactPhone === ''
        ? null
        : patch.contactPhone.trim()
  }
  if (patch.notes !== undefined) {
    $set.notes =
      patch.notes === null || patch.notes === '' ? null : patch.notes.trim()
  }
  if (patch.estimatedMonthlyVolumeGhs !== undefined) {
    $set.estimatedMonthlyVolumeGhs = patch.estimatedMonthlyVolumeGhs
  }
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.priority !== undefined) $set.priority = patch.priority
  if (patch.scoutedBy !== undefined) $set.scoutedBy = patch.scoutedBy.trim()
  if (patch.scoutedAt !== undefined) $set.scoutedAt = patch.scoutedAt
  if (patch.latitude !== undefined) $set.latitude = patch.latitude
  if (patch.longitude !== undefined) $set.longitude = patch.longitude

  const res = await collection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfScoutedOutletDoc | null
}

export async function deleteScoutedOutlet(
  db: Db,
  id: ObjectId,
): Promise<boolean> {
  const r = await collection(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}
