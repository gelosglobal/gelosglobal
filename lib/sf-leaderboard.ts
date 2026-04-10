import type { Db, WithoutId } from 'mongodb'
import { addDays, startOfDay, subDays } from 'date-fns'
import { SF_VISITS_COLLECTION, type SfVisitDoc } from '@/lib/sf-dashboard'

export type SfLeaderboardMetric = 'sellIn' | 'visits' | 'outlets'

export type SfLeaderboardParams = {
  from: Date
  to: Date
  metric: SfLeaderboardMetric
}

export type SfLeaderboardRow = {
  rep: string
  visits: number
  outletsVisited: number
  sellInGhs: number
  lastVisitedAt: string | null
}

export type SfLeaderboardSnapshot = {
  generatedAt: string
  range: { from: string; to: string }
  metric: SfLeaderboardMetric
  items: SfLeaderboardRow[]
}

function visitsCollection(db: Db) {
  return db.collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
}

export function defaultSfLeaderboardRange(now = new Date()) {
  const to = startOfDay(now)
  const from = startOfDay(subDays(to, 29))
  return { from, to }
}

export async function computeSfLeaderboard(
  db: Db,
  params: SfLeaderboardParams,
): Promise<SfLeaderboardSnapshot> {
  const fromStart = startOfDay(params.from)
  const toExclusive = addDays(startOfDay(params.to), 1)
  const now = new Date()

  const sortStage =
    params.metric === 'visits'
      ? { visits: -1, sellIn: -1 }
      : params.metric === 'outlets'
        ? { outletsCount: -1, visits: -1, sellIn: -1 }
        : { sellIn: -1, visits: -1 }

  const rows = await visitsCollection(db)
    .aggregate<{
      _id: string
      visits: number
      sellIn: number
      outlets: string[]
      outletsCount: number
      lastVisitedAt: Date | null
    }>([
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
          lastVisitedAt: { $max: '$visitedAt' },
        },
      },
      {
        $addFields: {
          outletsCount: { $size: { $ifNull: ['$outlets', []] } },
        },
      },
      { $sort: sortStage },
      { $limit: 200 },
    ])
    .toArray()

  return {
    generatedAt: now.toISOString(),
    range: { from: fromStart.toISOString(), to: startOfDay(params.to).toISOString() },
    metric: params.metric,
    items: rows.map((r) => ({
      rep: r._id || 'Unknown',
      visits: r.visits,
      outletsVisited: r.outletsCount ?? (r.outlets ?? []).length,
      sellInGhs: r.sellIn,
      lastVisitedAt: r.lastVisitedAt ? r.lastVisitedAt.toISOString() : null,
    })),
  }
}

