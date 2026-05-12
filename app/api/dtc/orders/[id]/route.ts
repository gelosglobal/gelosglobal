import { auth, ensureAuthMongo } from '@/lib/auth'
import { mirrorDtcOrderToCustomerIntelLedger } from '@/lib/dtc-customer-intelligence-ledger'
import {
  attachResolvedInventoryIds,
  applyInventoryDeltaForOrderItems,
  isDtcOrderInventoryError,
  orderItemsForInventoryAttach,
  restoreInventoryForOrderItems,
} from '@/lib/dtc-order-inventory'
import {
  deleteDtcOrder,
  getDtcOrderById,
  serializeOrder,
  updateDtcOrder,
  type DtcOrderItem,
} from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchBodySchema = z
  .object({
    customer: z.string().trim().min(1).max(200).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    customerEmail: z.string().trim().max(200).optional(),
    customerLocation: z.string().trim().max(200).optional(),
    channel: z.enum(['Web', 'Instagram', 'B2B portal', 'TikTok', 'Other']).optional(),
    paymentMethod: z
      .enum(['cash', 'momo', 'card', 'bank_transfer', 'pay_on_delivery'])
      .optional(),
    items: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(64).optional(),
          inventoryItemId: z
            .string()
            .trim()
            .regex(/^[a-f\d]{24}$/i)
            .optional(),
          name: z.string().trim().min(1).max(200),
          qty: z.coerce.number().int().positive().max(1_000_000),
          unitPrice: z.coerce.number().positive().max(10_000_000),
        }),
      )
      .min(1)
      .optional(),
    discountGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    status: z.enum(['fulfilled', 'processing', 'pending_payment']).optional(),
    orderedAt: z.string().datetime().optional(),
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

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const oid = new ObjectId(id)
  const existing = await getDtcOrderById(db, oid)
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  let nextItems = existing.items
  let previousForDelta: DtcOrderItem[] | null = null
  if (parsed.data.items !== undefined) {
    try {
      nextItems = await attachResolvedInventoryIds(db, parsed.data.items)
    } catch (e) {
      if (isDtcOrderInventoryError(e)) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
    try {
      previousForDelta = await attachResolvedInventoryIds(
        db,
        orderItemsForInventoryAttach(existing.items),
      )
      await applyInventoryDeltaForOrderItems(db, previousForDelta, nextItems)
    } catch (e) {
      if (isDtcOrderInventoryError(e)) {
        const status = e.code === 'INSUFFICIENT' ? 409 : 400
        return NextResponse.json({ error: e.message }, { status })
      }
      throw e
    }
  }

  const updated = await updateDtcOrder(db, oid, {
    customer: parsed.data.customer,
    customerPhone: parsed.data.customerPhone,
    customerEmail: parsed.data.customerEmail,
    customerLocation: parsed.data.customerLocation,
    channel: parsed.data.channel,
    paymentMethod: parsed.data.paymentMethod,
    items: parsed.data.items !== undefined ? nextItems : undefined,
    discountGhs: parsed.data.discountGhs,
    status: parsed.data.status,
    orderedAt: parsed.data.orderedAt ? new Date(parsed.data.orderedAt) : undefined,
  })

  if (!updated) {
    if (parsed.data.items !== undefined && previousForDelta) {
      try {
        await applyInventoryDeltaForOrderItems(db, nextItems, previousForDelta)
      } catch {
        // best-effort rollback — inventory may be inconsistent; log for ops
        console.error('[PATCH /api/dtc/orders/:id] failed to rollback inventory after missing order update')
      }
    }
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  try {
    await mirrorDtcOrderToCustomerIntelLedger(db, updated)
  } catch {
    // best-effort — PATCH response still returns the saved order
  }

  return NextResponse.json({ order: serializeOrder(updated) })
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
  const oid = new ObjectId(id)
  const existing = await getDtcOrderById(db, oid)
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const snapshotItems = existing.items
  const ok = await deleteDtcOrder(db, oid)
  if (!ok) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  try {
    const linesToRestore = await attachResolvedInventoryIds(
      db,
      orderItemsForInventoryAttach(snapshotItems),
    )
    await restoreInventoryForOrderItems(db, linesToRestore)
  } catch (err) {
    console.error('[DELETE /api/dtc/orders/:id] inventory restore failed after delete', err)
  }

  return NextResponse.json({ ok: true })
}

