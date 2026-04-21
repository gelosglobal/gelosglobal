import { auth, ensureAuthMongo } from '@/lib/auth'
import { SF_B2B_INVOICES_COLLECTION } from '@/lib/sf-b2b-invoices'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const paymentMethodSchema = z.enum(['momo', 'cash', 'bank_transfer', 'cheque'])

const rowSchema = z.object({
  outletName: z.string().trim().min(1).max(200),
  invoiceNumber: z.string().trim().min(1).max(64),
  invoiceAt: z.string().datetime().optional(),
  amountGhs: z.number().finite().min(0).max(1_000_000_000),
  discountGhs: z.number().finite().min(0).max(1_000_000_000).optional(),
  paidGhs: z.number().finite().min(0).max(1_000_000_000).optional(),
  paymentMethod: paymentMethodSchema.optional(),
  dueAt: z.string().datetime().optional(),
  repName: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
})

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const now = new Date()
  const { db } = getMongo()

  // Deduplicate by outlet + invoice number.
  const ops = parsed.data.rows.map((r) => {
    const amount = r.amountGhs
    const discount = Math.max(0, Math.min(amount, r.discountGhs ?? 0))
    const paid = Math.max(0, Math.min(Math.max(0, amount - discount), r.paidGhs ?? 0))
    return {
      updateOne: {
        filter: { outletName: r.outletName, invoiceNumber: r.invoiceNumber },
        update: {
          $setOnInsert: {
            outletName: r.outletName,
            invoiceNumber: r.invoiceNumber,
            invoiceAt: r.invoiceAt ? new Date(r.invoiceAt) : undefined,
            amountGhs: amount,
            discountGhs: discount > 0 ? discount : undefined,
            paidGhs: paid,
            paymentMethod: r.paymentMethod,
            dueAt: r.dueAt ? new Date(r.dueAt) : undefined,
            repName: r.repName,
            notes: r.notes,
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }
  })

  const res = await db.collection(SF_B2B_INVOICES_COLLECTION).bulkWrite(ops, { ordered: false })

  return NextResponse.json({
    ok: true,
    inserted: res.upsertedCount ?? 0,
    matched: res.matchedCount ?? 0,
  })
}

