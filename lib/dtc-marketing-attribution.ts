import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { spendByChannelFromCampaigns } from '@/lib/dtc-marketing-campaigns'
import {
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNEL_ORDER,
  type MarketingChannelKey,
} from '@/lib/dtc-marketing-channels'
import { DTC_ORDERS_COLLECTION, type DtcOrderDoc } from '@/lib/dtc-orders'

export type { MarketingChannelKey } from '@/lib/dtc-marketing-channels'
export {
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNEL_ORDER,
} from '@/lib/dtc-marketing-channels'

/** @deprecated Legacy collection; spend now comes from campaigns. */
export const DTC_MARKETING_SPEND_COLLECTION = 'dtc_marketing_spend'

/** Map DTC order acquisition channel → marketing bucket for attribution. */
export function orderChannelToMarketingKey(
  ch: DtcOrderDoc['channel'],
): MarketingChannelKey {
  switch (ch) {
    case 'Instagram':
      return 'meta'
    case 'TikTok':
      return 'tiktok'
    case 'Web':
      return 'google'
    case 'B2B portal':
      return 'b2b'
    case 'Other':
    default:
      return 'other'
  }
}

export type MarketingAttributionRow = {
  key: MarketingChannelKey
  label: string
  spend: number
  attributed: number
  roas: number | null
}

async function attributedRevenueByKey(
  db: Db,
  since: Date,
): Promise<Map<MarketingChannelKey, number>> {
  const map = new Map<MarketingChannelKey, number>()
  for (const k of MARKETING_CHANNEL_ORDER) map.set(k, 0)

  const orders = (await db
    .collection(DTC_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: since } })
    .project({ channel: 1, totalAmount: 1 })
    .limit(10000)
    .toArray()) as Pick<DtcOrderDoc, 'channel' | 'totalAmount'>[]

  for (const o of orders) {
    const key = orderChannelToMarketingKey(o.channel)
    map.set(key, (map.get(key) ?? 0) + o.totalAmount)
  }
  return map
}

export type MarketingAttributionSnapshot = {
  periodDays: number
  rows: MarketingAttributionRow[]
  totalSpend: number
  totalAttributed: number
  blendedRoas: number | null
}

export async function computeMarketingAttribution(
  db: Db,
  periodDays = 30,
): Promise<MarketingAttributionSnapshot> {
  const now = new Date()
  const since = subDays(now, periodDays)
  const [spendMap, revenueMap] = await Promise.all([
    spendByChannelFromCampaigns(db, since, now),
    attributedRevenueByKey(db, since),
  ])

  const rows: MarketingAttributionRow[] = []
  let totalSpend = 0
  let totalAttributed = 0

  for (const key of MARKETING_CHANNEL_ORDER) {
    const spend = spendMap.get(key) ?? 0
    const attributed = revenueMap.get(key) ?? 0
    totalSpend += spend
    totalAttributed += attributed
    const roas = spend > 0 ? attributed / spend : null
    rows.push({
      key,
      label: MARKETING_CHANNEL_LABELS[key],
      spend,
      attributed,
      roas,
    })
  }

  const blendedRoas = totalSpend > 0 ? totalAttributed / totalSpend : null

  return {
    periodDays,
    rows,
    totalSpend,
    totalAttributed,
    blendedRoas,
  }
}
