import { subDays } from 'date-fns'
import type { B2BCashCollectionDoc } from '@/lib/dtc-finance'

export type B2bCashCollectionJson = {
  id: string
  amountGhs: number
  collectedAt: string
  note: string | null
  outletName: string | null
  repName: string | null
  createdAt: string
}

export function serializeB2bCashCollection(
  doc: B2BCashCollectionDoc,
): B2bCashCollectionJson {
  return {
    id: doc._id.toHexString(),
    amountGhs: doc.amountGhs,
    collectedAt: doc.collectedAt.toISOString(),
    note: doc.note ?? null,
    outletName: doc.outletName ?? null,
    repName: doc.repName ?? null,
    createdAt: doc.createdAt.toISOString(),
  }
}

export type B2bPaymentsKpis = {
  periodDays: number
  periodStart: string
  periodEnd: string
  /** B2B portal order total in the period. */
  invoicedGhs: number
  /** Logged trade cash in the period (same window as invoiced). */
  collectedGhs: number
  /** Manual AR from Finance Layer. */
  outstandingGhs: number
  /** collectedGhs / invoicedGhs × 100 when invoiced > 0; otherwise null. */
  collectionRatePct: number | null
  /** Count of cash collection rows in the ledger (all time). */
  totalLoggedEntries: number
}

export function buildB2bPaymentsKpis(input: {
  periodDays: number
  now: Date
  invoicedGhs: number
  collectedGhs: number
  outstandingGhs: number
  totalLoggedEntries: number
}): B2bPaymentsKpis {
  const since = subDays(input.now, input.periodDays)
  const collectionRatePct =
    input.invoicedGhs > 0
      ? Math.min(
          999.9,
          Math.round((input.collectedGhs / input.invoicedGhs) * 1000) / 10,
        )
      : null
  return {
    periodDays: input.periodDays,
    periodStart: since.toISOString(),
    periodEnd: input.now.toISOString(),
    invoicedGhs: input.invoicedGhs,
    collectedGhs: input.collectedGhs,
    outstandingGhs: input.outstandingGhs,
    collectionRatePct,
    totalLoggedEntries: input.totalLoggedEntries,
  }
}
