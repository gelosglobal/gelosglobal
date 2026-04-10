import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import {
  differenceInCalendarDays,
  endOfDay,
  max,
  min,
  startOfDay,
} from 'date-fns'
import {
  MARKETING_CHANNEL_ORDER,
  type MarketingChannelKey,
} from '@/lib/dtc-marketing-channels'

export const DTC_MARKETING_CAMPAIGNS_COLLECTION = 'dtc_marketing_campaigns'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'

export type DtcMarketingCampaignDoc = {
  _id: ObjectId
  name: string
  channelKey: MarketingChannelKey
  /** Total campaign budget over [startDate, endDate]. */
  spendGhs: number
  status: CampaignStatus
  startDate: Date
  endDate: Date
  createdAt: Date
  updatedAt: Date
}

export type DtcMarketingCampaignJson = {
  id: string
  name: string
  channelKey: MarketingChannelKey
  spendGhs: number
  status: CampaignStatus
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

function campaignsCollection(db: Db) {
  return db.collection<WithoutId<DtcMarketingCampaignDoc>>(
    DTC_MARKETING_CAMPAIGNS_COLLECTION,
  )
}

export function serializeCampaign(doc: DtcMarketingCampaignDoc): DtcMarketingCampaignJson {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    channelKey: doc.channelKey,
    spendGhs: doc.spendGhs,
    status: doc.status,
    startDate: doc.startDate.toISOString(),
    endDate: doc.endDate.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

/** Spend from a campaign allocated to [windowStart, windowEnd] by calendar-day proration. Draft = 0. */
export function allocateCampaignSpendToWindow(
  campaign: Pick<
    DtcMarketingCampaignDoc,
    'spendGhs' | 'status' | 'startDate' | 'endDate'
  >,
  windowStart: Date,
  windowEnd: Date,
): number {
  if (campaign.status === 'draft' || campaign.spendGhs <= 0) return 0
  const cStart = startOfDay(campaign.startDate)
  const cEnd = endOfDay(campaign.endDate)
  const wStart = startOfDay(windowStart)
  const wEnd = endOfDay(windowEnd)
  const overlapStart = max([cStart, wStart])
  const overlapEnd = min([cEnd, wEnd])
  if (overlapStart > overlapEnd) return 0
  const overlapDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1
  const campaignDays = Math.max(
    1,
    differenceInCalendarDays(cEnd, cStart) + 1,
  )
  return campaign.spendGhs * (overlapDays / campaignDays)
}

export async function spendByChannelFromCampaigns(
  db: Db,
  windowStart: Date,
  windowEnd: Date,
): Promise<Map<MarketingChannelKey, number>> {
  const map = new Map<MarketingChannelKey, number>()
  for (const k of MARKETING_CHANNEL_ORDER) map.set(k, 0)

  const rows = (await campaignsCollection(db)
    .find({})
    .sort({ startDate: -1 })
    .limit(2000)
    .toArray()) as DtcMarketingCampaignDoc[]

  for (const c of rows) {
    const alloc = allocateCampaignSpendToWindow(c, windowStart, windowEnd)
    if (alloc <= 0) continue
    if (!MARKETING_CHANNEL_ORDER.includes(c.channelKey)) continue
    map.set(c.channelKey, (map.get(c.channelKey) ?? 0) + alloc)
  }
  return map
}

export async function listMarketingCampaigns(
  db: Db,
): Promise<DtcMarketingCampaignDoc[]> {
  const rows = await campaignsCollection(db)
    .find({})
    .sort({ startDate: -1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as DtcMarketingCampaignDoc)
}

export async function getMarketingCampaignById(
  db: Db,
  id: ObjectId,
): Promise<DtcMarketingCampaignDoc | null> {
  const doc = await campaignsCollection(db).findOne({ _id: id })
  return doc as DtcMarketingCampaignDoc | null
}

export type CreateMarketingCampaignInput = {
  name: string
  channelKey: MarketingChannelKey
  spendGhs: number
  status: CampaignStatus
  startDate: Date
  endDate: Date
}

export async function createMarketingCampaign(
  db: Db,
  input: CreateMarketingCampaignInput,
): Promise<DtcMarketingCampaignDoc> {
  const now = new Date()
  const doc: WithoutId<DtcMarketingCampaignDoc> = {
    name: input.name.trim(),
    channelKey: input.channelKey,
    spendGhs: input.spendGhs,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
  }
  const res = await campaignsCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateMarketingCampaignInput = Partial<{
  name: string
  channelKey: MarketingChannelKey
  spendGhs: number
  status: CampaignStatus
  startDate: Date
  endDate: Date
}>

export async function updateMarketingCampaign(
  db: Db,
  id: ObjectId,
  patch: UpdateMarketingCampaignInput,
): Promise<DtcMarketingCampaignDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.channelKey !== undefined) $set.channelKey = patch.channelKey
  if (patch.spendGhs !== undefined) $set.spendGhs = patch.spendGhs
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.startDate !== undefined) $set.startDate = patch.startDate
  if (patch.endDate !== undefined) $set.endDate = patch.endDate

  const res = await campaignsCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as DtcMarketingCampaignDoc | null
}

export async function deleteMarketingCampaign(
  db: Db,
  id: ObjectId,
): Promise<boolean> {
  const r = await campaignsCollection(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}
