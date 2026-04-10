import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  createMarketingCampaign,
  listMarketingCampaigns,
  serializeCampaign,
} from '@/lib/dtc-marketing-campaigns'
import { MARKETING_CHANNEL_ORDER } from '@/lib/dtc-marketing-channels'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const campaignStatusSchema = z.enum(['draft', 'active', 'paused', 'completed'])

const createBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    channelKey: z.enum(
      MARKETING_CHANNEL_ORDER as unknown as [string, ...string[]],
    ),
    spendGhs: z.coerce.number().min(0).max(1_000_000_000),
    status: campaignStatusSchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate.getTime() >= d.startDate.getTime(), {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  const rows = await listMarketingCampaigns(db)
  return NextResponse.json({
    campaigns: rows.map(serializeCampaign),
  })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const doc = await createMarketingCampaign(db, {
    name: parsed.data.name,
    channelKey: parsed.data.channelKey as (typeof MARKETING_CHANNEL_ORDER)[number],
    spendGhs: parsed.data.spendGhs,
    status: parsed.data.status,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  })
  return NextResponse.json(
    { campaign: serializeCampaign(doc) },
    { status: 201 },
  )
}
