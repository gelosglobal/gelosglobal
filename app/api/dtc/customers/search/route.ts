import { auth, ensureAuthMongo } from '@/lib/auth'
import { DTC_ORDERS_COLLECTION } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'
const DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION = 'dtc_customer_intelligence_ledger'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

const MAX_Q = 120
const MAX_RESULTS = 50

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export type DtcCustomerSearchResult = {
  id: string
  customerName: string
  phoneNumber: string
  location: string
  email: string
}

/**
 * GET /api/dtc/customers/search?q=…
 * Matches name, phone, email, and location (case-insensitive) for the order engine and similar UIs.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const qRaw = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (qRaw.length === 0) {
    return NextResponse.json({ results: [] satisfies DtcCustomerSearchResult[] }, { headers: noStore })
  }

  const q = qRaw.slice(0, MAX_Q)
  const esc = escapeRegex(q)
  const pattern = new RegExp(esc, 'i')
  const digits = q.replace(/\D/g, '')
  const orClauses: Record<string, unknown>[] = [
    { customer: pattern },
    { phone: pattern },
    { email: pattern },
    { location: pattern },
  ]
  if (digits.length >= 2) {
    orClauses.push({ phone: new RegExp(escapeRegex(digits), 'i') })
  }

  const ledgerOrClauses: Record<string, unknown>[] = [
    { customerName: pattern },
    { phoneNumber: pattern },
    { location: pattern },
    { paymentMethod: pattern },
  ]
  if (digits.length >= 2) {
    // Ledger phone numbers are often stored normalized (digits-only); support "+233..." searches too.
    ledgerOrClauses.push({ phoneNumber: new RegExp(escapeRegex(digits), 'i') })
  }

  const ordersOrClauses: Record<string, unknown>[] = [
    { customer: pattern },
    { customerPhone: pattern },
    { customerEmail: pattern },
    { customerLocation: pattern },
  ]
  if (digits.length >= 2) {
    ordersOrClauses.push({ customerPhone: new RegExp(escapeRegex(digits), 'i') })
  }

  const { db } = getMongo()
  const [rawCustomers, rawLedger, rawOrders] = await Promise.all([
    db
      .collection(DTC_CUSTOMERS_COLLECTION)
      .find(
        {
          $and: [{ customer: { $type: 'string', $ne: '' } }, { $or: orClauses }],
        },
        {
          projection: {
            _id: 1,
            customer: 1,
            phone: 1,
            email: 1,
            location: 1,
          },
          limit: MAX_RESULTS,
          sort: { customer: 1, _id: 1 },
        },
      )
      .toArray(),
    db
      .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
      .find(
        {
          $and: [{ customerName: { $type: 'string', $ne: '' } }, { $or: ledgerOrClauses }],
        },
        {
          projection: {
            _id: 1,
            customerName: 1,
            phoneNumber: 1,
            location: 1,
          },
          limit: MAX_RESULTS,
          sort: { customerName: 1, _id: 1 },
        },
      )
      .toArray(),
    db
      .collection(DTC_ORDERS_COLLECTION)
      .find(
        {
          $and: [{ customer: { $type: 'string', $ne: '' } }, { $or: ordersOrClauses }],
        },
        {
          projection: {
            _id: 1,
            customer: 1,
            customerPhone: 1,
            customerEmail: 1,
            customerLocation: 1,
          },
          limit: MAX_RESULTS,
          sort: { customer: 1, _id: 1 },
        },
      )
      .toArray(),
  ])

  // IMPORTANT: Do NOT dedupe. Users expect to see every matching customer/order row
  // (e.g. same name appearing multiple times with different phones).
  const results: DtcCustomerSearchResult[] = [
    ...(rawCustomers as any[]).map((r) => ({
      id: `c:${String(r._id?.toString?.() ?? '')}`,
      customerName: String(r.customer ?? ''),
      phoneNumber: String(r.phone ?? ''),
      location: String(r.location ?? ''),
      email: String(r.email ?? ''),
    })),
    ...(rawLedger as any[]).map((r) => ({
      id: `l:${String(r._id?.toString?.() ?? '')}`,
      customerName: String(r.customerName ?? ''),
      phoneNumber: String(r.phoneNumber ?? ''),
      location: String(r.location ?? ''),
      email: '',
    })),
    ...(rawOrders as any[]).map((r) => ({
      id: `o:${String(r._id?.toString?.() ?? '')}`,
      customerName: String(r.customer ?? ''),
      phoneNumber: String(r.customerPhone ?? ''),
      location: String(r.customerLocation ?? ''),
      email: String(r.customerEmail ?? ''),
    })),
  ].slice(0, MAX_RESULTS)

  return NextResponse.json({ results }, { headers: noStore })
}
