import { auth, ensureAuthMongo } from '@/lib/auth'
import { deleteDtcOrder } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const { db } = getMongo()
  const ok = await deleteDtcOrder(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

