import type { Db, WithoutId } from 'mongodb'
import { addDays, startOfDay, subDays } from 'date-fns'
import {
  SF_OUTLETS_COLLECTION,
  SF_VISITS_COLLECTION,
  type SfOutletDoc,
  type SfVisitDoc,
} from '@/lib/sf-dashboard'

export type SfReportsParams = {
  /** Inclusive start (date portion). */
  from: Date
  /** Inclusive end (date portion). */
  to: Date
}

export type SfReportsSnapshot = {
  generatedAt: string
  range: { from: string; to: string }
  kpis: {
    completedVisits: number
    sellInGhs: number
    activeReps: number
    outletsVisited: number
    activeOutlets: number
    coveragePct: number | null
  }
  repPerformance: Array<{
    rep: string
    visits: number
    sellInGhs: number
    outletsVisited: number
  }>
  outletActivity: Array<{
    outlet: string
    visits: number
    sellInGhs: number
    reps: number
    lastVisitedAt: string
  }>
}

function visitsCollection(db: Db) {
  return db.collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
}

function outletsCollection(db: Db) {
  return db.collection<WithoutId<SfOutletDoc>>(SF_OUTLETS_COLLECTION)
}

export function defaultSfReportsRange(now = new Date()): SfReportsParams {
  const to = startOfDay(now)
  const from = startOfDay(subDays(to, 29))
  return { from, to }
}

export async function computeSfReportsSnapshot(
  db: Db,
  params: SfReportsParams,
): Promise<SfReportsSnapshot> {
  const fromStart = startOfDay(params.from)
  const toExclusive = addDays(startOfDay(params.to), 1)
  const now = new Date()

  const [activeOutlets, totalsAgg, repAgg, outletAgg] = await Promise.all([
    outletsCollection(db).countDocuments({ isActive: true }),
    visitsCollection(db)
      .aggregate<{ visits: number; sellIn: number; outlets: string[]; reps: string[] }>([
        {
          $match: {
            status: 'completed',
            visitedAt: { $gte: fromStart, $lt: toExclusive },
          },
        },
        {
          $group: {
            _id: null,
            visits: { $sum: 1 },
            sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
            outlets: { $addToSet: '$outletName' },
            reps: { $addToSet: '$repName' },
          },
        },
      ])
      .toArray(),
    visitsCollection(db)
      .aggregate<{ _id: string; visits: number; sellIn: number; outlets: string[] }>([
        {
          $match: {
            status: 'completed',
            visitedAt: { $gte: fromStart, $lt: toExclusive },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$repName', 'Unknown'] },
            visits: { $sum: 1 },
            sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
            outlets: { $addToSet: '$outletName' },
          },
        },
        { $sort: { sellIn: -1, visits: -1 } },
        { $limit: 100 },
      ])
      .toArray(),
    visitsCollection(db)
      .aggregate<{
        _id: string
        visits: number
        sellIn: number
        reps: string[]
        lastVisitedAt: Date
      }>([
        {
          $match: {
            status: 'completed',
            visitedAt: { $gte: fromStart, $lt: toExclusive },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$outletName', 'Unknown'] },
            visits: { $sum: 1 },
            sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
            reps: { $addToSet: '$repName' },
            lastVisitedAt: { $max: '$visitedAt' },
          },
        },
        { $sort: { visits: -1, sellIn: -1 } },
        { $limit: 250 },
      ])
      .toArray(),
  ])

  const totals = totalsAgg[0]
  const completedVisits = totals?.visits ?? 0
  const sellInGhs = totals?.sellIn ?? 0

  const outletsVisited = (totals?.outlets ?? []).filter(
    (o) => typeof o === 'string' && o.trim().length > 0,
  ).length

  const activeReps = (totals?.reps ?? []).filter(
    (r) => typeof r === 'string' && r.trim().length > 0,
  ).length

  let resolvedActiveOutlets = activeOutlets
  if (resolvedActiveOutlets === 0) {
    // Fall back to distinct visited outlets in the last 30 days (similar to SF dashboard logic).
    const names = await visitsCollection(db).distinct('outletName', {
      status: 'completed',
      visitedAt: { $gte: subDays(now, 30), $lte: now },
    })
    resolvedActiveOutlets = names.filter(
      (n) => typeof n === 'string' && n.trim().length > 0,
    ).length
  }

  const coveragePct =
    resolvedActiveOutlets > 0
      ? Math.min(999, Math.round((outletsVisited / resolvedActiveOutlets) * 1000) / 10)
      : null

  return {
    generatedAt: now.toISOString(),
    range: {
      from: fromStart.toISOString(),
      to: startOfDay(params.to).toISOString(),
    },
    kpis: {
      completedVisits,
      sellInGhs,
      activeReps,
      outletsVisited,
      activeOutlets: resolvedActiveOutlets,
      coveragePct,
    },
    repPerformance: repAgg.map((r) => ({
      rep: r._id || 'Unknown',
      visits: r.visits,
      sellInGhs: r.sellIn,
      outletsVisited: (r.outlets ?? []).length,
    })),
    outletActivity: outletAgg.map((o) => ({
      outlet: o._id || 'Unknown',
      visits: o.visits,
      sellInGhs: o.sellIn,
      reps: (o.reps ?? []).length,
      lastVisitedAt: (o.lastVisitedAt ?? now).toISOString(),
    })),
  }
}

