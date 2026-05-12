import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'
import {
  decrementSfInventoryOnHandById,
  incrementSfInventoryOnHandById,
  SF_INVENTORY_COLLECTION,
} from '@/lib/sf-inventory'
import type { SfB2bInvoiceItem } from '@/lib/sf-b2b-invoices'

export class SfB2bInvoiceInventoryError extends Error {
  readonly code: 'AMBIGUOUS_SKU' | 'NOT_FOUND' | 'INSUFFICIENT'

  constructor(code: SfB2bInvoiceInventoryError['code'], message: string) {
    super(message)
    this.name = 'SfB2bInvoiceInventoryError'
    this.code = code
  }
}

export function isSfB2bInvoiceInventoryError(e: unknown): e is SfB2bInvoiceInventoryError {
  return e instanceof SfB2bInvoiceInventoryError
}

export function extractSfInventoryItemIdFromLine(it: {
  inventoryItemId?: unknown
}): string | undefined {
  const raw = it.inventoryItemId
  if (raw == null) return undefined
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s && ObjectId.isValid(s)) return s
    return undefined
  }
  if (raw instanceof ObjectId) return raw.toHexString()
  return undefined
}

export function invoiceItemsForSfInventoryAttach(items: SfB2bInvoiceItem[]): Array<{
  name: string
  sku?: string
  qty: number
  unitPriceGhs: number
  unitCostGhs?: number
  inventoryItemId?: string
}> {
  return items.map((it) => {
    const inv = extractSfInventoryItemIdFromLine(it)
    const qty = Number((it as { qty?: unknown }).qty)
    const unitPriceGhs = Number((it as { unitPriceGhs?: unknown }).unitPriceGhs)
    const unitCostGhs = Number((it as { unitCostGhs?: unknown }).unitCostGhs)
    return {
      name: it.name,
      sku: it.sku,
      qty: Number.isFinite(qty) ? qty : 0,
      unitPriceGhs: Number.isFinite(unitPriceGhs) ? unitPriceGhs : 0,
      ...(Number.isFinite(unitCostGhs) ? { unitCostGhs } : {}),
      ...(inv ? { inventoryItemId: inv } : {}),
    }
  })
}

type DecOp = { id: ObjectId; qty: number }

function qtyByInventoryItemId(items: SfB2bInvoiceItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    const idStr = extractSfInventoryItemIdFromLine(it)
    if (!idStr) continue
    const k = idStr.toLowerCase()
    const qty = Number((it as { qty?: unknown }).qty)
    const q = Number.isFinite(qty) ? qty : 0
    if (q <= 0) continue
    m.set(k, (m.get(k) ?? 0) + q)
  }
  return m
}

export function inventoryDecrementOpsFromInvoiceItems(items: SfB2bInvoiceItem[]): DecOp[] {
  const m = qtyByInventoryItemId(items)
  return [...m.entries()].map(([k, qty]) => ({ id: new ObjectId(k), qty }))
}

export async function resolveSfInvoiceLineInventoryId(
  db: Db,
  item: Pick<SfB2bInvoiceItem, 'sku' | 'inventoryItemId'>,
): Promise<ObjectId | null> {
  const invHex = extractSfInventoryItemIdFromLine(item as { inventoryItemId?: unknown })
  if (invHex) {
    const oid = new ObjectId(invHex)
    const col = db.collection(SF_INVENTORY_COLLECTION)
    const exists = await col.findOne({ _id: oid }, { projection: { _id: 1 } })
    if (!exists) {
      throw new SfB2bInvoiceInventoryError(
        'NOT_FOUND',
        'One or more retail inventory lines no longer exist. Refresh and pick products again.',
      )
    }
    return oid
  }

  const sku = item.sku?.trim()
  if (!sku) return null

  const upper = sku.toUpperCase()
  const docs = await db
    .collection(SF_INVENTORY_COLLECTION)
    .find<{ _id: ObjectId }>({ sku: upper })
    .limit(5)
    .toArray()

  if (docs.length === 0) return null
  if (docs.length > 1) {
    throw new SfB2bInvoiceInventoryError(
      'AMBIGUOUS_SKU',
      `SKU "${sku}" matches multiple retail stock rows. Pick the line from retail inventory.`,
    )
  }
  return docs[0]!._id
}

export async function attachResolvedSfInvoiceLineIds(
  db: Db,
  items: Array<{
    name: string
    sku?: string
    qty: number
    unitPriceGhs: number
    unitCostGhs?: number
    inventoryItemId?: string
  }>,
): Promise<SfB2bInvoiceItem[]> {
  const out: SfB2bInvoiceItem[] = []
  for (const item of items) {
    const id = await resolveSfInvoiceLineInventoryId(db, item)
    const unitCost =
      typeof item.unitCostGhs === 'number' && Number.isFinite(item.unitCostGhs)
        ? item.unitCostGhs
        : undefined
    out.push({
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      unitPriceGhs: item.unitPriceGhs,
      ...(unitCost !== undefined ? { unitCostGhs: unitCost } : {}),
      ...(id ? { inventoryItemId: id.toHexString() } : {}),
    })
  }
  return out
}

async function rollbackSfDecrements(db: Db, applied: DecOp[]) {
  for (const op of applied.slice().reverse()) {
    await incrementSfInventoryOnHandById(db, op.id, op.qty)
  }
}

export async function withSfInventoryDecrementsForNewInvoice<T>(
  db: Db,
  ops: DecOp[],
  fn: () => Promise<T>,
): Promise<T> {
  const applied: DecOp[] = []
  for (const op of ops) {
    const r = await decrementSfInventoryOnHandById(db, op.id, op.qty)
    if (r === 'not_found') {
      await rollbackSfDecrements(db, applied)
      throw new SfB2bInvoiceInventoryError(
        'NOT_FOUND',
        'One or more retail inventory lines no longer exist. Refresh and pick products again.',
      )
    }
    if (r === 'insufficient') {
      await rollbackSfDecrements(db, applied)
      throw new SfB2bInvoiceInventoryError(
        'INSUFFICIENT',
        'Insufficient retail stock for one or more lines.',
      )
    }
    applied.push(op)
  }
  try {
    return await fn()
  } catch (e) {
    await rollbackSfDecrements(db, applied)
    throw e
  }
}

type DeltaOp = { id: ObjectId; delta: number }

function buildSfInventoryDeltaOps(oldItems: SfB2bInvoiceItem[], newItems: SfB2bInvoiceItem[]): DeltaOp[] {
  const oldM = qtyByInventoryItemId(oldItems)
  const newM = qtyByInventoryItemId(newItems)
  const keys = new Set([...oldM.keys(), ...newM.keys()])
  const deltas: DeltaOp[] = []
  for (const k of keys) {
    const delta = (newM.get(k) ?? 0) - (oldM.get(k) ?? 0)
    if (delta !== 0) deltas.push({ id: new ObjectId(k), delta })
  }
  return deltas
}

export async function applySfInventoryDeltaForInvoiceItems(
  db: Db,
  oldItems: SfB2bInvoiceItem[],
  newItems: SfB2bInvoiceItem[],
): Promise<void> {
  const deltas = buildSfInventoryDeltaOps(oldItems, newItems)
  const applied: DeltaOp[] = []
  try {
    for (const { id, delta } of deltas) {
      if (delta > 0) {
        const r = await decrementSfInventoryOnHandById(db, id, delta)
        if (r === 'not_found') {
          throw new SfB2bInvoiceInventoryError(
            'NOT_FOUND',
            'One or more retail inventory lines no longer exist. Refresh and pick products again.',
          )
        }
        if (r === 'insufficient') {
          throw new SfB2bInvoiceInventoryError(
            'INSUFFICIENT',
            'Insufficient retail stock for the updated quantities.',
          )
        }
      } else if (delta < 0) {
        await incrementSfInventoryOnHandById(db, id, -delta)
      }
      applied.push({ id, delta })
    }
  } catch (e) {
    for (const a of applied.slice().reverse()) {
      if (a.delta > 0) await incrementSfInventoryOnHandById(db, a.id, a.delta)
      else if (a.delta < 0) await decrementSfInventoryOnHandById(db, a.id, -a.delta)
    }
    throw e
  }
}

export async function restoreSfInventoryForInvoiceItems(db: Db, items: SfB2bInvoiceItem[]): Promise<void> {
  const ops = inventoryDecrementOpsFromInvoiceItems(items)
  for (const op of ops) {
    await incrementSfInventoryOnHandById(db, op.id, op.qty)
  }
}
