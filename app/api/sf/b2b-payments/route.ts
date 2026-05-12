import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computeInvoiceKpis,
  createSfB2bInvoice,
  listSfB2bInvoices,
  serializeSfB2bInvoice,
  type SfB2bInvoiceItem,
} from '@/lib/sf-b2b-invoices'
import {
  attachResolvedSfInvoiceLineIds,
  inventoryDecrementOpsFromInvoiceItems,
  isSfB2bInvoiceInventoryError,
  withSfInventoryDecrementsForNewInvoice,
} from '@/lib/sf-b2b-invoice-inventory'
import { subDays } from 'date-fns'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional(),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceGhs: z.coerce.number().min(0).max(1_000_000_000),
  unitCostGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  inventoryItemId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
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
          // Date filter uses *invoice dates*.
          const d = r.invoiceAt ?? r.dueAt
          if (!d || Number.isNaN(d.getTime())) return false
          const since = subDays(now, periodDays)
          return d >= since && d <= now
        })
  const kpis = computeInvoiceKpis(rows, now)

  return NextResponse.json(
    {
      invoices: rows.map((r) => serializeSfB2bInvoice(r, now)),
      kpis,
    },
    { headers: noStore },
  )
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
  const effectiveDate = d.dueAt ?? (d.invoiceAt ? new Date(d.invoiceAt) : undefined)

  const rawLines = (d.items ?? []).map((it) => ({
    name: it.name,
    sku: it.sku,
    qty: it.qty,
    unitPriceGhs: it.unitPriceGhs,
    unitCostGhs: it.unitCostGhs,
    inventoryItemId: it.inventoryItemId,
  }))

  let preparedLines: SfB2bInvoiceItem[] = []
  try {
    preparedLines = await attachResolvedSfInvoiceLineIds(db, rawLines)
  } catch (e) {
    if (isSfB2bInvoiceInventoryError(e)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
  const ops = inventoryDecrementOpsFromInvoiceItems(preparedLines)

  let doc
  try {
    doc = await withSfInventoryDecrementsForNewInvoice(db, ops, () =>
      createSfB2bInvoice(db, {
        outletName: d.outletName,
        invoiceNumber: d.invoiceNumber,
        invoiceAt: effectiveDate,
        amountGhs: d.amountGhs,
        discountGhs: d.discountGhs,
        paidGhs: d.paidGhs ?? 0,
        paidAt: d.paidAt ? new Date(d.paidAt) : undefined,
        paymentMethod: d.paymentMethod,
        items: preparedLines.length > 0 ? preparedLines : undefined,
        dueAt: effectiveDate,
        repName: d.repName,
        notes: d.notes,
      }),
    )
  } catch (e) {
    if (isSfB2bInvoiceInventoryError(e)) {
      const status = e.code === 'INSUFFICIENT' ? 409 : 400
      return NextResponse.json({ error: e.message }, { status })
    }
    throw e
  }

  return NextResponse.json(
    { ok: true, invoice: serializeSfB2bInvoice(doc) },
    { status: 201, headers: noStore },
  )
}
