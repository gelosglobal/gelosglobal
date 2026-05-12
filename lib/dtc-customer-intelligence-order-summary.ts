import {
  type DtcCustomerIntelLedgerDoc,
  dtcCustomerIntelLedgerPhoneKey,
} from '@/lib/dtc-customer-intelligence-ledger'
import type { DtcOrderDoc, DtcOrderItem } from '@/lib/dtc-orders'

export type DtcCiOrderProductSummary = {
  key: string
  name: string
  sku: string | null
  timesOrdered: number
  units: number
}

export type DtcCiOrderCustomerSummary = {
  identityKey: string
  customerName: string
  customerPhone: string
  customerLocation: string
  orderCount: number
  /** Sum of money attributed to this buyer across merged sell-outs (see rollup rules). */
  totalPaidGhs: number
  /** Latest known sell-out date for at-risk / analytics (ISO), or null. */
  lastOrderedAt: string | null
  products: DtcCiOrderProductSummary[]
}

type InternalProduct = {
  name: string
  sku: string | null
  orderIds: Set<string>
  units: number
}

type InternalCustomer = {
  customerName: string
  customerPhone: string
  customerLocation: string
  orderIds: Set<string>
  /** GHS summed from each merged sell-out (order total or ledger collected / amount). */
  totalMoneyGhs: number
  /** Max `orderedAt` seen across merged sell-outs (ms); 0 = unknown. */
  lastOrderedAtMs: number
  products: Map<string, InternalProduct>
}

function normCustomerName(name: string) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normEmail(email: string | undefined) {
  const s = String(email ?? '').trim().toLowerCase()
  return s.includes('@') ? s : ''
}

/** Treat as a real phone key only if it has enough digits (avoids "0", "--", etc. collapsing everyone). */
function phoneKeyHasEnoughDigits(phoneKey: string, minDigits: number) {
  const digits = (phoneKey.match(/\d/g) ?? []).length
  return digits >= minDigits
}

/**
 * One intelligence row per distinct buyer on the order.
 * - Strong phone (≥9 digits) + non-empty display name: same phone + same normalized name → one row.
 * - Strong phone but missing/blank `customer`: each order is its own row (`#order:<mongoId>`) so thousands
 *   of sell-outs on a shared shop line are not collapsed into a single “unknown” customer.
 * - Else valid email: same rules with `#order:…` when the display name is empty.
 * - Else: normalized display name, or per-order when that name is empty.
 */
export function customerIdentityKeyFromOrder(
  o: Pick<DtcOrderDoc, '_id' | 'customer' | 'customerPhone' | 'customerEmail'>,
): string {
  const orderId = o._id.toHexString()
  const nkRaw = normCustomerName(o.customer)
  const nk = nkRaw || 'unknown'
  /** Blank customer on the order must not share one bucket with every other unnamed order on that phone. */
  const nameKey = nk === 'unknown' ? `order:${orderId}` : nk

  const raw = dtcCustomerIntelLedgerPhoneKey(o.customerPhone)
  if (raw.length > 0 && phoneKeyHasEnoughDigits(raw, 9)) {
    return `phone:${raw}#${nameKey}`
  }
  const em = normEmail(o.customerEmail)
  if (em) {
    return `email:${em}#${nameKey}`
  }
  return `name:${nameKey}`
}

/** Ledger: prefer captured collections, else amount to collect. */
export function ledgerRowMoneyGhs(row: DtcCustomerIntelLedgerDoc): number {
  const tc = Number(row.totalCollectedGhs)
  if (Number.isFinite(tc) && tc > 0) return tc
  const parts =
    (Number(row.cashCollectedGhs) || 0) +
    (Number(row.momoCollectedGhs) || 0) +
    (Number(row.paystackCollectedGhs) || 0)
  if (parts > 0) return parts
  const due = Number(row.amountToCollectGhs)
  return Number.isFinite(due) && due > 0 ? due : 0
}

function productLineKey(item: Pick<DtcOrderItem, 'sku' | 'name'>) {
  const sku = (item.sku ?? '').trim().toLowerCase()
  const name = String(item.name ?? '')
    .trim()
    .toLowerCase()
  return `${sku}::${name}`
}

export function newCustomerRollupMap(): Map<string, InternalCustomer> {
  return new Map()
}

function mergeLastOrderedAt(
  row: InternalCustomer,
  orderedAt: Pick<DtcOrderDoc, 'orderedAt'>['orderedAt'] | undefined,
) {
  let ms: number | null = null
  if (orderedAt instanceof Date && !Number.isNaN(orderedAt.getTime())) {
    ms = orderedAt.getTime()
  } else if (orderedAt != null) {
    const t = new Date(orderedAt as string | Date).getTime()
    if (Number.isFinite(t) && !Number.isNaN(t)) ms = t
  }
  if (ms == null) return
  row.lastOrderedAtMs = Math.max(row.lastOrderedAtMs ?? 0, ms)
}

/**
 * Merge one `dtc_orders` document into the rollup map (call for every order in the collection).
 */
export function accumulateDtcOrderForCustomerRollup(
  map: Map<string, InternalCustomer>,
  order: Pick<
    DtcOrderDoc,
    | '_id'
    | 'orderNumber'
    | 'customer'
    | 'customerPhone'
    | 'customerEmail'
    | 'customerLocation'
    | 'items'
    | 'totalAmount'
  > & { orderedAt?: DtcOrderDoc['orderedAt'] },
): void {
  const orderId = order._id.toHexString()
  const identityKey = customerIdentityKeyFromOrder(order)
  let row = map.get(identityKey)
  if (!row) {
    const fallbackLabel =
      String(order.orderNumber ?? '').trim() || order._id.toHexString().slice(0, 8)
    row = {
      customerName: order.customer.trim() || `Unknown buyer (${fallbackLabel})`,
      customerPhone: String(order.customerPhone ?? '').trim(),
      customerLocation: String(order.customerLocation ?? '').trim(),
      orderIds: new Set(),
      totalMoneyGhs: 0,
      lastOrderedAtMs: 0,
      products: new Map(),
    }
    map.set(identityKey, row)
  } else {
    const cn = order.customer.trim()
    if (cn && cn.length > row.customerName.length) {
      row.customerName = cn
    }
    if (!row.customerPhone && order.customerPhone?.trim()) {
      row.customerPhone = order.customerPhone.trim()
    }
    if (!row.customerLocation && order.customerLocation?.trim()) {
      row.customerLocation = order.customerLocation.trim()
    }
  }

  row.orderIds.add(orderId)

  mergeLastOrderedAt(row, order.orderedAt)

  const amt = Number(order.totalAmount)
  if (Number.isFinite(amt) && amt >= 0) {
    row.totalMoneyGhs += amt
  }

  const items = Array.isArray(order.items) ? order.items : []
  for (const it of items) {
    const name = String(it.name ?? '').trim()
    if (!name) continue
    const pk = productLineKey(it)
    let pr = row.products.get(pk)
    if (!pr) {
      pr = {
        name,
        sku: it.sku?.trim() ? it.sku.trim() : null,
        orderIds: new Set(),
        units: 0,
      }
      row.products.set(pk, pr)
    }
    pr.orderIds.add(orderId)
    const q = Number(it.qty ?? 0) || 0
    if (q > 0) pr.units += q
  }
}

/**
 * Merge one Customer Intelligence ledger row (imports + mirrored engine rows) into the same rollup map.
 * Call only for ledger rows that are **not** already represented by a `dtc_orders` row with the same
 * `orderNumber` (case-insensitive trim), to avoid double-counting mirrored sell-outs.
 */
export function accumulateLedgerRowForCustomerRollup(
  map: Map<string, InternalCustomer>,
  row: DtcCustomerIntelLedgerDoc,
): void {
  const items: DtcOrderItem[] = (row.items ?? [])
    .map((it) => ({
      ...(it.sku?.trim() ? { sku: it.sku.trim() } : {}),
      name: String(it.name ?? '').trim(),
      qty: Math.max(1, Math.round(Number(it.qty) || 0)),
      unitPrice: Number(it.unitPrice) || 0,
    }))
    .filter((it) => it.name)

  const orderedAt =
    row.orderedAt instanceof Date && !Number.isNaN(row.orderedAt.getTime())
      ? row.orderedAt
      : row.createdAt instanceof Date && !Number.isNaN(row.createdAt.getTime())
        ? row.createdAt
        : undefined

  accumulateDtcOrderForCustomerRollup(map, {
    _id: row._id,
    orderNumber: String(row.orderNumber ?? ''),
    customer: String(row.customerName ?? ''),
    customerPhone: String(row.phoneNumber ?? ''),
    customerEmail: undefined,
    customerLocation: String(row.location ?? ''),
    totalAmount: ledgerRowMoneyGhs(row),
    orderedAt,
    items,
  })
}

export function finalizeCustomerRollups(map: Map<string, InternalCustomer>): DtcCiOrderCustomerSummary[] {
  const list: DtcCiOrderCustomerSummary[] = []

  for (const [identityKey, r] of map) {
    const productRows: DtcCiOrderProductSummary[] = [...r.products.entries()].map(([key, p]) => ({
      key,
      name: p.name,
      sku: p.sku,
      timesOrdered: p.orderIds.size,
      units: p.units,
    }))
    productRows.sort((a, b) => b.timesOrdered - a.timesOrdered || b.units - a.units)

    list.push({
      identityKey,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerLocation: r.customerLocation,
      orderCount: r.orderIds.size,
      totalPaidGhs: Math.round(r.totalMoneyGhs * 100) / 100,
      lastOrderedAt:
        r.lastOrderedAtMs > 0 ? new Date(r.lastOrderedAtMs).toISOString() : null,
      products: productRows,
    })
  }

  list.sort(
    (a, b) =>
      b.orderCount - a.orderCount ||
      b.totalPaidGhs - a.totalPaidGhs ||
      a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' }),
  )

  return list
}
