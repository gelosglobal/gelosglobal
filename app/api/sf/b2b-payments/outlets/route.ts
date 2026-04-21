import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { SF_B2B_INVOICES_COLLECTION } from '@/lib/sf-b2b-invoices'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { db } = getMongo()

  const rows = await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .aggregate<{ outletName: string; invoices: number; lastInvoiceAt: Date }>([
      {
        $match: {
          outletName: { $type: 'string', $ne: '' },
        },
      },
      {
        $group: {
          _id: '$outletName',
          invoices: { $sum: 1 },
          lastInvoiceAt: { $max: { $ifNull: ['$invoiceAt', '$createdAt'] } },
        },
      },
      { $sort: { invoices: -1, _id: 1 } },
      { $limit: 5000 },
      {
        $project: {
          _id: 0,
          outletName: '$_id',
          invoices: 1,
          lastInvoiceAt: 1,
        },
      },
    ])
    .toArray()

  return NextResponse.json({
    outlets: rows.map((r) => ({
      outletName: r.outletName,
      invoices: r.invoices ?? 0,
      lastInvoiceAt: r.lastInvoiceAt ? r.lastInvoiceAt.toISOString() : null,
    })),
  })
}

