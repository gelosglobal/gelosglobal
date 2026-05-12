import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  attachResolvedSfInvoiceLineIds,
  applySfInventoryDeltaForInvoiceItems,
  invoiceItemsForSfInventoryAttach,
  isSfB2bInvoiceInventoryError,
  restoreSfInventoryForInvoiceItems,
} from '@/lib/sf-b2b-invoice-inventory'
import type { SfB2bInvoiceItem } from '@/lib/sf-b2b-invoices'
import {
  deleteSfB2bInvoice,
  getSfB2bInvoiceById,
  serializeSfB2bInvoice,
  updateSfB2bInvoice,
  type UpdateSfB2bInvoiceInput,
} from '@/lib/sf-b2b-invoices'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
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

const patchBodySchema = z
  .object({
    outletName: z.string().trim().min(1).max(200).optional(),
    invoiceNumber: z.string().trim().min(1).max(64).optional(),
    invoiceAt: z.string().datetime().nullable().optional(),
    amountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    discountGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    paidGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    paidAt: z.string().datetime().nullable().optional(),
    paymentMethod: z.enum(['momo', 'cash', 'bank_transfer', 'cheque']).nullable().optional(),
    items: z.array(itemSchema).max(200).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    repName: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
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
  const existing = await getSfB2bInvoiceById(db, oid)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let nextItems: SfB2bInvoiceItem[] | undefined
  let previousForDelta: SfB2bInvoiceItem[] | null = null
  if (parsed.data.items !== undefined) {
    try {
      const raw = parsed.data.items === null ? [] : parsed.data.items
      nextItems = await attachResolvedSfInvoiceLineIds(
        db,
        raw.map((it) => ({
          name: it.name,
          sku: it.sku,
          qty: it.qty,
          unitPriceGhs: it.unitPriceGhs,
          unitCostGhs: it.unitCostGhs,
          inventoryItemId: it.inventoryItemId,
        })),
      )
    } catch (e) {
      if (isSfB2bInvoiceInventoryError(e)) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
    try {
      previousForDelta = await attachResolvedSfInvoiceLineIds(
        db,
        invoiceItemsForSfInventoryAttach(existing.items ?? []),
      )
      await applySfInventoryDeltaForInvoiceItems(db, previousForDelta, nextItems)
    } catch (e) {
      if (isSfB2bInvoiceInventoryError(e)) {
        const status = e.code === 'INSUFFICIENT' ? 409 : 400
        return NextResponse.json({ error: e.message }, { status })
      }
      throw e
    }
  }

  const patch: UpdateSfB2bInvoiceInput = {}
  if (parsed.data.outletName !== undefined) patch.outletName = parsed.data.outletName
  if (parsed.data.invoiceNumber !== undefined) patch.invoiceNumber = parsed.data.invoiceNumber
  if (parsed.data.invoiceAt !== undefined) {
    patch.invoiceAt =
      parsed.data.invoiceAt === null ? null : new Date(parsed.data.invoiceAt)
  }
  if (parsed.data.amountGhs !== undefined) patch.amountGhs = parsed.data.amountGhs
  if (parsed.data.discountGhs !== undefined) patch.discountGhs = parsed.data.discountGhs
  if (parsed.data.paidGhs !== undefined) patch.paidGhs = parsed.data.paidGhs
  if (parsed.data.paidAt !== undefined) {
    patch.paidAt =
      parsed.data.paidAt === null ? null : new Date(parsed.data.paidAt)
  }
  if (parsed.data.paymentMethod !== undefined) patch.paymentMethod = parsed.data.paymentMethod
  if (parsed.data.items !== undefined) {
    patch.items = parsed.data.items === null ? null : nextItems
  }
  if (parsed.data.dueAt !== undefined) patch.dueAt = parsed.data.dueAt
  if (parsed.data.repName !== undefined) patch.repName = parsed.data.repName
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes

  const updated = await updateSfB2bInvoice(db, oid, patch)
  if (!updated) {
    if (parsed.data.items !== undefined && previousForDelta && nextItems !== undefined) {
      try {
        await applySfInventoryDeltaForInvoiceItems(db, nextItems, previousForDelta)
      } catch {
        console.error('[PATCH b2b-payments/:id] inventory rollback after failed update')
      }
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    invoice: serializeSfB2bInvoice(updated),
  }, { headers: noStore })
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
  const oid = new ObjectId(id)
  const existing = await getSfB2bInvoiceById(db, oid)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const snapshotItems = existing.items ?? []
  const ok = await deleteSfB2bInvoice(db, oid)
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const lines = await attachResolvedSfInvoiceLineIds(
      db,
      invoiceItemsForSfInventoryAttach(snapshotItems),
    )
    await restoreSfInventoryForInvoiceItems(db, lines)
  } catch (err) {
    console.error('[DELETE b2b-payments/:id] inventory restore failed after delete', err)
  }

  return NextResponse.json({ ok: true })
}
