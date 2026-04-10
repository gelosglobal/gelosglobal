export type MarketingChannelKey =
  | 'meta'
  | 'tiktok'
  | 'google'
  | 'influencer'
  | 'b2b'
  | 'other'

export const MARKETING_CHANNEL_ORDER: MarketingChannelKey[] = [
  'meta',
  'tiktok',
  'google',
  'influencer',
  'b2b',
  'other',
]

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannelKey, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  influencer: 'Influencer',
  b2b: 'B2B portal',
  other: 'Other',
}
