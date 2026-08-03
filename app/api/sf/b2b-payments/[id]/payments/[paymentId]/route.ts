import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  removeSfB2bInvoicePayment,
  serializeSfB2bInvoice,
} from '@/lib/sf-b2b-invoices'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, paymentId } = await context.params
  if (!ObjectId.isValid(id) || !paymentId?.trim()) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { db } = getMongo()
  const updated = await removeSfB2bInvoicePayment(
    db,
    new ObjectId(id),
    paymentId.trim(),
  )

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, invoice: serializeSfB2bInvoice(updated) },
    { headers: noStore },
  )
}
