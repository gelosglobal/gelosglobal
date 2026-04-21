import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  createSfInvoiceReceipt,
  listSfInvoiceReceipts,
  serializeSfInvoiceReceipt,
} from '@/lib/sf-invoice-receipts'
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

const itemSchema = z.object({
  description: z.string().trim().min(1).max(400),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceGhs: z.coerce.number().min(0).max(1_000_000_000),
})

const postBodySchema = z.object({
  outletName: z.string().trim().min(1).max(200),
  invoiceNumber: z.string().trim().min(1).max(64),
  invoiceAt: z.string().datetime().optional(),
  billFrom: z.string().trim().max(200).optional(),
  dueAt: z.coerce.date().optional(),
  items: z.array(itemSchema).min(1).max(500),
  amountGhs: z.coerce.number().min(0).max(1_000_000_000),
  discountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  taxGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  totalGhs: z.coerce.number().min(0).max(1_000_000_000),
})

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { db } = getMongo()
  const rows = await listSfInvoiceReceipts(db)
  return NextResponse.json({ receipts: rows.map(serializeSfInvoiceReceipt) })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const d = parsed.data
  const doc = await createSfInvoiceReceipt(db, {
    outletName: d.outletName,
    invoiceNumber: d.invoiceNumber,
    invoiceAt: d.invoiceAt ? new Date(d.invoiceAt) : undefined,
    billFrom: d.billFrom,
    dueAt: d.dueAt,
    items: d.items,
    amountGhs: d.amountGhs,
    discountGhs: d.discountGhs,
    taxGhs: d.taxGhs,
    totalGhs: d.totalGhs,
  })

  return NextResponse.json(
    { ok: true, receipt: serializeSfInvoiceReceipt(doc) },
    { status: 201 },
  )
}

