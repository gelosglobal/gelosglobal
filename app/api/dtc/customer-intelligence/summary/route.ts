import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION,
  type DtcCustomerIntelLedgerDoc,
} from '@/lib/dtc-customer-intelligence-ledger'
import {
  accumulateDtcOrderForCustomerRollup,
  accumulateLedgerRowForCustomerRollup,
  finalizeCustomerRollups,
  newCustomerRollupMap,
} from '@/lib/dtc-customer-intelligence-order-summary'
import { DTC_ORDERS_COLLECTION, serializeOrder, type DtcOrderDoc } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

function normOrderNumberKey(v: unknown) {
  return String(v ?? '').trim().toLowerCase()
}

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  }

  const { db } = getMongo()
  const orderColl = db.collection<DtcOrderDoc>(DTC_ORDERS_COLLECTION)
  const ledgerColl = db.collection<DtcCustomerIntelLedgerDoc>(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)

  const rollupMap = newCustomerRollupMap()

  /** Ledger rows with this order # already counted from `dtc_orders` (mirrored sell-outs). */
  const engineOrderNumberKeys = new Set<string>()

  const recentDocs: DtcOrderDoc[] = []

  const orderCursor = orderColl.find({}).sort({ createdAt: -1 }).batchSize(250)

  for await (const doc of orderCursor) {
    const d = doc as DtcOrderDoc
    const onKey = normOrderNumberKey(d.orderNumber)
    if (onKey) engineOrderNumberKeys.add(onKey)

    if (recentDocs.length < 18) {
      recentDocs.push(d)
    }

    accumulateDtcOrderForCustomerRollup(rollupMap, d)
  }

  const ledgerCursor = ledgerColl.find({}).sort({ orderedAt: -1, updatedAt: -1, _id: -1 }).batchSize(250)

  for await (const raw of ledgerCursor) {
    const r = raw as DtcCustomerIntelLedgerDoc
    const onKey = normOrderNumberKey(r.orderNumber)
    if (onKey && engineOrderNumberKeys.has(onKey)) {
      continue
    }

    accumulateLedgerRowForCustomerRollup(rollupMap, r)
  }

  const customers = finalizeCustomerRollups(rollupMap)
  const recentOrders = recentDocs.map((d) => serializeOrder(d))

  return NextResponse.json(
    {
      customers,
      recentOrders,
    },
    { headers: noStore },
  )
}
