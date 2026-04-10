import { auth, ensureAuthMongo } from '@/lib/auth'
import { nominatimSearchFirst } from '@/lib/nominatim-geocode'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

/**
 * Server-side geocode (Nominatim). Use sparingly; throttle in production if needed.
 */
export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Missing or short query' }, { status: 400 })
  }
  if (q.length > 300) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 })
  }

  let result: Awaited<ReturnType<typeof nominatimSearchFirst>>
  try {
    result = await nominatimSearchFirst(q)
  } catch {
    return NextResponse.json({ error: 'Geocode request failed' }, { status: 502 })
  }

  if (!result) {
    return NextResponse.json({ error: 'No results' }, { status: 404 })
  }

  return NextResponse.json({
    lat: result.lat,
    lon: result.lon,
    label: result.label,
  })
}
