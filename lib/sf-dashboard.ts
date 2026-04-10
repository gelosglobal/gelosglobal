import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { startOfDay, startOfMonth, subDays } from 'date-fns'
import {
  getOrCreateFinanceConfig,
  sumB2BCashCollections,
} from '@/lib/dtc-finance'
import {
  computeStockHealth,
  listDtcInventory,
  type DtcInventoryDoc,
} from '@/lib/dtc-inventory'
import { DTC_ORDERS_COLLECTION } from '@/lib/dtc-orders'

export const SF_OUTLETS_COLLECTION = 'sf_outlets'
export const SF_VISITS_COLLECTION = 'sf_visits'
export const SF_POSM_TASKS_COLLECTION = 'sf_posm_tasks'
export const SF_SETTINGS_COLLECTION = 'sf_settings'

export type SfVisitStatus = 'scheduled' | 'completed' | 'cancelled'

export type SfVisitType =
  | 'routine'
  | 'follow_up'
  | 'new_listing'
  | 'issue_resolution'
  | 'other'

export type SfVisitDoc = {
  _id: ObjectId
  outletName: string
  /** Area / neighbourhood (optional; helps routing). */
  area?: string
  repName: string
  status: SfVisitStatus
  scheduledAt?: Date
  visitedAt?: Date
  /** Sell-in captured on a completed visit (GHS). */
  sellInGhs?: number
  visitType?: SfVisitType
  durationMinutes?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type SfOutletDoc = {
  _id: ObjectId
  name: string
  region?: string
  isActive: boolean
  createdAt: Date
}

export type SfPosmTaskStatus = 'open' | 'done'

export type SfPosmTaskDoc = {
  _id: ObjectId
  title: string
  outletName: string
  status: SfPosmTaskStatus
  dueAt?: Date
  createdAt: Date
}

export type SfSettingsDoc = {
  _id: string
  monthlyTargetGhs: number
  primaryRegionLabel: string
  updatedAt: Date
}

export type SfDashboardAlert = {
  id: string
  severity: 'high' | 'medium'
  text: string
}

export type SfDashboardUpcomingVisit = {
  id: string
  outlet: string
  rep: string
  scheduledAt: string
}

export type SfDashboardRepRow = {
  rep: string
  visits: number
  sellInGhs: number
}

export type SfDashboardSnapshot = {
  generatedAt: string
  primaryRegionLabel: string
  kpis: {
    activeOutlets: number
    visits7d: number
    b2bSellIn7d: number
    collections7d: number
    targetAttainmentPct: number | null
    monthlyTargetGhs: number
    mtdSellInGhs: number
    mtdCollectionsGhs: number
    openPosmTasks: number
  }
  upcomingVisits: SfDashboardUpcomingVisit[]
  repPulse: SfDashboardRepRow[]
  alerts: SfDashboardAlert[]
}

async function sumB2BPortalRevenue(
  db: Db,
  since: Date,
  until: Date,
): Promise<number> {
  const rows = await db
    .collection(DTC_ORDERS_COLLECTION)
    .aggregate<{ t: number }>([
      {
        $match: {
          channel: 'B2B portal',
          orderedAt: { $gte: since, $lte: until },
        },
      },
      { $group: { _id: null, t: { $sum: '$totalAmount' } } },
    ])
    .toArray()
  return rows[0]?.t ?? 0
}

export async function getOrCreateSfSettings(db: Db): Promise<SfSettingsDoc> {
  const col = db.collection<SfSettingsDoc>(SF_SETTINGS_COLLECTION)
  const existing = await col.findOne({ _id: 'default' })
  if (existing) return existing
  const doc: SfSettingsDoc = {
    _id: 'default',
    monthlyTargetGhs: 80_000,
    primaryRegionLabel: 'Greater Accra',
    updatedAt: new Date(),
  }
  await col.insertOne(doc)
  return doc
}

export async function updateSfSettings(
  db: Db,
  patch: Partial<Pick<SfSettingsDoc, 'monthlyTargetGhs' | 'primaryRegionLabel'>>,
): Promise<SfSettingsDoc> {
  await getOrCreateSfSettings(db)
  const col = db.collection<SfSettingsDoc>(SF_SETTINGS_COLLECTION)
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.monthlyTargetGhs !== undefined) {
    $set.monthlyTargetGhs = Math.max(
      0,
      Math.min(1_000_000_000, patch.monthlyTargetGhs),
    )
  }
  if (patch.primaryRegionLabel !== undefined) {
    const t = patch.primaryRegionLabel.trim()
    $set.primaryRegionLabel = t.length > 0 ? t.slice(0, 120) : 'Greater Accra'
  }
  const res = await col.findOneAndUpdate(
    { _id: 'default' },
    { $set },
    { returnDocument: 'after' },
  )
  return (res as SfSettingsDoc) ?? (await getOrCreateSfSettings(db))
}

function visitsCollection(db: Db) {
  return db.collection<WithoutId<SfVisitDoc>>(SF_VISITS_COLLECTION)
}

function outletsCollection(db: Db) {
  return db.collection<WithoutId<SfOutletDoc>>(SF_OUTLETS_COLLECTION)
}

function posmCollection(db: Db) {
  return db.collection<WithoutId<SfPosmTaskDoc>>(SF_POSM_TASKS_COLLECTION)
}

export async function computeSfDashboardSnapshot(
  db: Db,
): Promise<SfDashboardSnapshot> {
  const now = new Date()
  const since7 = subDays(now, 7)
  const monthStart = startOfMonth(now)
  const dayStart = startOfDay(now)

  const [settings, financeConfig, inventoryRows] = await Promise.all([
    getOrCreateSfSettings(db),
    getOrCreateFinanceConfig(db),
    listDtcInventory(db),
  ])

  let [
    activeOutlets,
    visits7d,
    b2bSellIn7d,
    collections7d,
    mtdSellIn,
    mtdCollections,
    upcomingDocs,
    repAgg,
    openPosm,
    overduePosm,
  ] = await Promise.all([
    outletsCollection(db).countDocuments({ isActive: true }),
    visitsCollection(db).countDocuments({
      status: 'completed',
      visitedAt: { $gte: since7, $lte: now },
    }),
    sumB2BPortalRevenue(db, since7, now),
    sumB2BCashCollections(db, since7, now),
    sumB2BPortalRevenue(db, monthStart, now),
    sumB2BCashCollections(db, monthStart, now),
    visitsCollection(db)
      .find({
        status: 'scheduled',
        scheduledAt: { $gte: dayStart },
      })
      .sort({ scheduledAt: 1 })
      .limit(12)
      .toArray(),
    visitsCollection(db)
      .aggregate<{
        _id: string
        visits: number
        sellIn: number
      }>([
        {
          $match: {
            status: 'completed',
            visitedAt: { $gte: since7, $lte: now },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$repName', 'Unknown'] },
            visits: { $sum: 1 },
            sellIn: { $sum: { $ifNull: ['$sellInGhs', 0] } },
          },
        },
        { $sort: { sellIn: -1, visits: -1 } },
        { $limit: 12 },
      ])
      .toArray(),
    posmCollection(db).countDocuments({ status: 'open' }),
    posmCollection(db)
      .find({
        status: 'open',
        dueAt: { $lt: now },
      })
      .limit(20)
      .toArray(),
  ])

  if (activeOutlets === 0) {
    const names = await visitsCollection(db).distinct('outletName', {
      status: 'completed',
      visitedAt: { $gte: subDays(now, 30), $lte: now },
    })
    activeOutlets = names.filter((n) => typeof n === 'string' && n.trim().length > 0).length
  }

  const mtdTotal = mtdSellIn + mtdCollections
  const targetAttainmentPct =
    settings.monthlyTargetGhs > 0
      ? Math.min(
          999,
          Math.round((mtdTotal / settings.monthlyTargetGhs) * 1000) / 10,
        )
      : null

  const upcomingVisits: SfDashboardUpcomingVisit[] = (
    upcomingDocs as SfVisitDoc[]
  ).map((v) => ({
    id: v._id.toHexString(),
    outlet: v.outletName,
    rep: v.repName,
    scheduledAt: (v.scheduledAt ?? v.createdAt).toISOString(),
  }))

  const repPulse: SfDashboardRepRow[] = repAgg.map((r) => ({
    rep: r._id || 'Unknown',
    visits: r.visits,
    sellInGhs: r.sellIn,
  }))

  const alerts: SfDashboardAlert[] = []

  let invAlerts = 0
  for (const row of inventoryRows as DtcInventoryDoc[]) {
    if (invAlerts >= 8) break
    const h = computeStockHealth(row.onHand, row.safetyStock)
    if (h === 'critical' || h === 'low') {
      invAlerts += 1
      alerts.push({
        id: `inv-${row._id.toHexString()}`,
        severity: h === 'critical' ? 'high' : 'medium',
        text: `[Stock] ${row.name} (${row.sku}) — ${row.onHand} on hand vs ${row.safetyStock} safety · ${row.warehouse}`,
      })
    }
  }

  for (const t of overduePosm as SfPosmTaskDoc[]) {
    alerts.push({
      id: `posm-${t._id.toHexString()}`,
      severity: 'high',
      text: `[POSM] Overdue: ${t.title} · ${t.outletName}`,
    })
  }

  if (financeConfig.b2bOutstandingGhs >= 5_000) {
    alerts.push({
      id: 'fin-b2b-outstanding',
      severity: financeConfig.b2bOutstandingGhs >= 20_000 ? 'high' : 'medium',
      text: `[B2B] Outstanding receivables: GHS ${financeConfig.b2bOutstandingGhs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    })
  }

  return {
    generatedAt: now.toISOString(),
    primaryRegionLabel: settings.primaryRegionLabel,
    kpis: {
      activeOutlets,
      visits7d,
      b2bSellIn7d,
      collections7d,
      targetAttainmentPct,
      monthlyTargetGhs: settings.monthlyTargetGhs,
      mtdSellInGhs: mtdSellIn,
      mtdCollectionsGhs: mtdCollections,
      openPosmTasks: openPosm,
    },
    upcomingVisits,
    repPulse,
    alerts: alerts.slice(0, 25),
  }
}
