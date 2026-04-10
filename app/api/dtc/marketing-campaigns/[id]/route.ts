import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  deleteMarketingCampaign,
  getMarketingCampaignById,
  serializeCampaign,
  updateMarketingCampaign,
  type UpdateMarketingCampaignInput,
} from '@/lib/dtc-marketing-campaigns'
import {
  MARKETING_CHANNEL_ORDER,
  type MarketingChannelKey,
} from '@/lib/dtc-marketing-channels'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const campaignStatusSchema = z.enum(['draft', 'active', 'paused', 'completed'])

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    channelKey: z
      .enum(MARKETING_CHANNEL_ORDER as unknown as [string, ...string[]])
      .optional(),
    spendGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    status: campaignStatusSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const oid = new ObjectId(id)
  const existing = await getMarketingCampaignById(db, oid)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const p = parsed.data
  const nextStart = p.startDate ?? existing.startDate
  const nextEnd = p.endDate ?? existing.endDate
  if (nextEnd.getTime() < nextStart.getTime()) {
    return NextResponse.json(
      { error: 'End date must be on or after start date' },
      { status: 400 },
    )
  }

  const update: UpdateMarketingCampaignInput = {}
  if (p.name !== undefined) update.name = p.name
  if (p.channelKey !== undefined) {
    update.channelKey = p.channelKey as MarketingChannelKey
  }
  if (p.spendGhs !== undefined) update.spendGhs = p.spendGhs
  if (p.status !== undefined) update.status = p.status
  if (p.startDate !== undefined) update.startDate = p.startDate
  if (p.endDate !== undefined) update.endDate = p.endDate

  const updated = await updateMarketingCampaign(db, oid, update)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ campaign: serializeCampaign(updated) })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { db } = getMongo()
  const ok = await deleteMarketingCampaign(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
