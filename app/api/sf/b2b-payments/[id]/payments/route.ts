import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  addSfB2bInvoicePayment,
  serializeSfB2bInvoice,
} from '@/lib/sf-b2b-invoices'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

const postBodySchema = z.object({
  amountGhs: z.coerce.number().positive().max(1_000_000_000),
  paidAt: z.string().datetime().optional(),
  paymentMethod: z.enum(['momo', 'cash', 'bank_transfer', 'cheque']).optional(),
  note: z.string().trim().max(500).optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function POST(
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

  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const updated = await addSfB2bInvoicePayment(db, new ObjectId(id), {
    amountGhs: parsed.data.amountGhs,
    paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
    paymentMethod: parsed.data.paymentMethod,
    note: parsed.data.note,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, invoice: serializeSfB2bInvoice(updated) },
    { status: 201, headers: noStore },
  )
}
