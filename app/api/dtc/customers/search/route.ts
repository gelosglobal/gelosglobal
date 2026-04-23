import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

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

  const { db } = getMongo()
  const raw = (await db
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
    .toArray()) as {
    _id: { toString: () => string }
    customer: string
    phone?: string
    email?: string
    location?: string
  }[]

  const results: DtcCustomerSearchResult[] = raw.map((r) => ({
    id: r._id.toString(),
    customerName: r.customer,
    phoneNumber: String(r.phone ?? ''),
    location: String(r.location ?? ''),
    email: String(r.email ?? ''),
  }))

  return NextResponse.json({ results }, { headers: noStore })
}
