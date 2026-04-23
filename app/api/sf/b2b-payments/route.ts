import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computeInvoiceKpis,
  createSfB2bInvoice,
  listSfB2bInvoices,
  serializeSfB2bInvoice,
} from '@/lib/sf-b2b-invoices'
import { subDays } from 'date-fns'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional(),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceGhs: z.coerce.number().min(0).max(1_000_000_000),
  unitCostGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
})

const postBodySchema = z.object({
  outletName: z.string().trim().min(1).max(200),
  invoiceNumber: z.string().trim().min(1).max(64),
  invoiceAt: z.string().datetime().optional(),
  amountGhs: z.coerce.number().min(0).max(1_000_000_000),
  discountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  paidGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  paidAt: z.string().datetime().optional(),
  paymentMethod: z.enum(['momo', 'cash', 'bank_transfer', 'cheque']).optional(),
  items: z.array(itemSchema).max(200).optional(),
  dueAt: z.coerce.date().optional(),
  repName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

function parsePeriodDays(url: URL): number {
  const raw = url.searchParams.get('periodDays')
  const n = raw ? Number(raw) : 30
  if (!Number.isFinite(n)) return 30
  const rounded = Math.round(n)
  if (rounded <= 0) return 0
  return Math.min(365, Math.max(7, rounded))
}

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  const now = new Date()
  const periodDays = parsePeriodDays(new URL(request.url))

  const rowsAll = await listSfB2bInvoices(db)
  const rows =
    periodDays <= 0
      ? rowsAll
      : rowsAll.filter((r) => {
          // Date filter uses *due dates* (not invoiceAt/paidAt/createdAt).
          const d = r.dueAt
          if (!d || Number.isNaN(d.getTime())) return false
          const since = subDays(now, periodDays)
          return d >= since && d <= now
        })
  const kpis = computeInvoiceKpis(rows, now)

  return NextResponse.json({
    invoices: rows.map((r) => serializeSfB2bInvoice(r, now)),
    kpis,
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

  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d = parsed.data
  const { db } = getMongo()
  const doc = await createSfB2bInvoice(db, {
    outletName: d.outletName,
    invoiceNumber: d.invoiceNumber,
    invoiceAt: d.invoiceAt ? new Date(d.invoiceAt) : undefined,
    amountGhs: d.amountGhs,
    discountGhs: d.discountGhs,
    paidGhs: d.paidGhs ?? 0,
    paidAt: d.paidAt ? new Date(d.paidAt) : undefined,
    paymentMethod: d.paymentMethod,
    items: d.items,
    dueAt: d.dueAt,
    repName: d.repName,
    notes: d.notes,
  })

  return NextResponse.json(
    { ok: true, invoice: serializeSfB2bInvoice(doc) },
    { status: 201 },
  )
}
