import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { startOfMonth, addMonths } from 'date-fns'
import { SF_VISITS_COLLECTION, type SfVisitDoc } from '@/lib/sf-dashboard'
import { SF_SCOUTED_OUTLETS_COLLECTION } from '@/lib/sf-outlet-scouting'

export const SF_TARGETS_COLLECTION = 'sf_targets'

/** Month key in the form YYYY-MM (e.g. 2026-04). */
export type SfTargetMonthKey = string

export type SfRepTargetDoc = {
  _id: ObjectId
  month: SfTargetMonthKey
  repName: string
  /** Optional region label to group/filter targets. */
  region?: string
  targetVisits: number
  targetSellInGhs: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type SfRepTargetJson = {
  id: string
  month: SfTargetMonthKey
  repName: string
  region?: string
  targetVisits: number
  targetSellInGhs: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export type SfRepTargetWithActuals = SfRepTargetJson & {
  actualVisitsMtd: number
  actualSellInMtdGhs: number
  newShopsAcquiredMtd: number
  visitsAttainmentPct: number | null
  sellInAttainmentPct: number | null
}

export function serializeSfTarget(doc: SfRepTargetDoc): SfRepTargetJson {
  return {
    id: doc._id.toHexString(),
    month: doc.month,
    repName: doc.repName,
    region: doc.region,
    targetVisits: doc.targetVisits,
    targetSellInGhs: doc.targetSellInGhs,
    notes: doc.notes,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function targetsCollection(db: Db) {
  return db.collection<WithoutId<SfRepTargetDoc>>(SF_TARGETS_COLLECTION)
}

export async function listSfTargets(db: Db, month: SfTargetMonthKey) {
  const rows = await targetsCollection(db)
    .find({ month })
    .sort({ repName: 1 })
    .limit(500)
    .toArray()
  return rows.map((r) => r as SfRepTargetDoc)
}

export type CreateSfTargetInput = {
  month: SfTargetMonthKey
  repName: string
  region?: string
  targetVisits: number
  targetSellInGhs: number
  notes?: string
}

export async function createSfTarget(
  db: Db,
  input: CreateSfTargetInput,
): Promise<SfRepTargetDoc> {
  const now = new Date()
  const doc: WithoutId<SfRepTargetDoc> = {
    month: input.month,
    repName: input.repName.trim(),
    region: input.region?.trim() || undefined,
    targetVisits: input.targetVisits,
    targetSellInGhs: input.targetSellInGhs,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const res = await targetsCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSfTargetInput = Partial<{
  repName: string
  region: string | null
  targetVisits: number
  targetSellInGhs: number
  notes: string | null
}>

export async function updateSfTarget(
  db: Db,
  id: ObjectId,
  patch: UpdateSfTargetInput,
): Promise<SfRepTargetDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.repName !== undefined) $set.repName = patch.repName.trim()
  if (patch.region !== undefined) $set.region = patch.region ? patch.region.trim() : undefined
  if (patch.targetVisits !== undefined) $set.targetVisits = patch.targetVisits
  if (patch.targetSellInGhs !== undefined) $set.targetSellInGhs = patch.targetSellInGhs
  if (patch.notes !== undefined) $set.notes = patch.notes ? patch.notes.trim() : undefined

  const res = await targetsCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfRepTargetDoc | null
}

function monthKeyToRange(month: SfTargetMonthKey) {
  const [yRaw, mRaw] = month.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const start = startOfMonth(new Date(y, Math.max(0, m - 1), 1))
  const end = addMonths(start, 1)
  return { start, end }
}

export async function computeSfTargetsWithActuals(
  db: Db,
  month: SfTargetMonthKey,
): Promise<SfRepTargetWithActuals[]> {
  const { start, end } = monthKeyToRange(month)
  const targets = await listSfTargets(db, month)

  const [actualAgg, wonAgg] = await Promise.all([
    db
    .collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
    .aggregate<{ _id: string; visits: number; sellIn: number }>([
      {
        $match: {
          status: 'completed',
        },
      },
      // Older rows may not have `visitedAt`; fall back so targets match Shop Visits.
      {
        $addFields: {
          effectiveVisitedAt: {
            $ifNull: ['$visitedAt', { $ifNull: ['$updatedAt', '$createdAt'] }],
          },
        },
      },
      { $match: { effectiveVisitedAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: { $ifNull: ['$repName', 'Unknown'] },
          visits: { $sum: 1 },
          sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
        },
      },
    ])
    .toArray()
    ,
    db
      .collection(SF_SCOUTED_OUTLETS_COLLECTION)
      .aggregate<{ _id: string; won: number }>([
        {
          $match: {
            status: 'won',
            scoutedAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$scoutedBy', 'Unknown'] },
            won: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ])

  const actualByRep = new Map(
    actualAgg.map((r) => [r._id || 'Unknown', { visits: r.visits, sellIn: r.sellIn }]),
  )
  const wonByRep = new Map(wonAgg.map((r) => [r._id || 'Unknown', r.won ?? 0]))

  return targets.map((t) => {
    const json = serializeSfTarget(t)
    const actual = actualByRep.get(json.repName) ?? { visits: 0, sellIn: 0 }
    const visitsAttainmentPct =
      json.targetVisits > 0
        ? Math.min(999, Math.round((actual.visits / json.targetVisits) * 1000) / 10)
        : null
    const sellInAttainmentPct =
      json.targetSellInGhs > 0
        ? Math.min(999, Math.round((actual.sellIn / json.targetSellInGhs) * 1000) / 10)
        : null
    return {
      ...json,
      actualVisitsMtd: actual.visits,
      actualSellInMtdGhs: actual.sellIn,
      newShopsAcquiredMtd: wonByRep.get(json.repName) ?? 0,
      visitsAttainmentPct,
      sellInAttainmentPct,
    }
  })
}

export type SfTargetsMtdSummary = {
  completedVisits: number
  sellInGhs: number
  shopsWon: number
}

export async function computeSfTargetsMtdSummary(
  db: Db,
  month: SfTargetMonthKey,
): Promise<SfTargetsMtdSummary> {
  const { start, end } = monthKeyToRange(month)
  const [visAgg, wonAgg] = await Promise.all([
    db
      .collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
      .aggregate<{ visits: number; sellIn: number }>([
        { $match: { status: 'completed' } },
        {
          $addFields: {
            effectiveVisitedAt: {
              $ifNull: ['$visitedAt', { $ifNull: ['$updatedAt', '$createdAt'] }],
            },
          },
        },
        { $match: { effectiveVisitedAt: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: null,
            visits: { $sum: 1 },
            sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
          },
        },
        { $project: { _id: 0, visits: 1, sellIn: 1 } },
      ])
      .toArray(),
    db
      .collection(SF_SCOUTED_OUTLETS_COLLECTION)
      .aggregate<{ won: number }>([
        { $match: { status: 'won', scoutedAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, won: { $sum: 1 } } },
        { $project: { _id: 0, won: 1 } },
      ])
      .toArray(),
  ])

  return {
    completedVisits: visAgg[0]?.visits ?? 0,
    sellInGhs: visAgg[0]?.sellIn ?? 0,
    shopsWon: wonAgg[0]?.won ?? 0,
  }
}

