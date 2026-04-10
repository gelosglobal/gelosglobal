import { auth, ensureAuthMongo } from '@/lib/auth'
import { nominatimSearchFirst } from '@/lib/nominatim-geocode'
import {
  buildAroundQuery,
  OVERPASS_INTERPRETER,
  OVERPASS_USER_AGENT,
  parseOverpassElements,
  type OverpassScanCategory,
} from '@/lib/sf-overpass'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const categoryEnum = z.enum([
  'pharmacy',
  'dentist',
  'supermarket',
  'mall_plaza',
])

const bodySchema = z
  .object({
    locationQuery: z.string().max(300).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().min(200).max(8000).default(2500),
    categories: z.array(categoryEnum).min(1).max(4),
  })
  .superRefine((d, ctx) => {
    const hasLat = d.latitude !== undefined
    const hasLon = d.longitude !== undefined
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both latitude and longitude, or use locationQuery',
        path: ['latitude'],
      })
    }
    const hasPair = hasLat && hasLon
    const q = d.locationQuery?.trim()
    const hasQ = q != null && q.length >= 2
    if (!hasPair && !hasQ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a location to search or provide coordinates',
        path: ['locationQuery'],
      })
    }
  })

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
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

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d = parsed.data
  let lat: number
  let lon: number
  let geocodedLabel: string | null = null

  if (d.latitude !== undefined && d.longitude !== undefined) {
    lat = d.latitude
    lon = d.longitude
  } else {
    const q = d.locationQuery!.trim()
    const geo = await nominatimSearchFirst(
      q.toLowerCase().includes('ghana') ? q : `${q}, Ghana`,
    )
    if (!geo) {
      return NextResponse.json(
        { error: 'Could not geocode that location' },
        { status: 404 },
      )
    }
    lat = geo.lat
    lon = geo.lon
    geocodedLabel = geo.label
  }

  const overpassQl = buildAroundQuery(
    lat,
    lon,
    d.radiusMeters,
    d.categories as OverpassScanCategory[],
  )

  let res: Response
  try {
    res = await fetch(OVERPASS_INTERPRETER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OVERPASS_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: overpassQl }).toString(),
      next: { revalidate: 0 },
    })
  } catch {
    return NextResponse.json(
      { error: 'Overpass request failed' },
      { status: 502 },
    )
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Overpass returned an error' },
      { status: 502 },
    )
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid Overpass response' },
      { status: 502 },
    )
  }

  const pois = parseOverpassElements(json, d.categories as OverpassScanCategory[])

  return NextResponse.json({
    center: { lat, lon },
    radiusMeters: d.radiusMeters,
    geocodedLabel,
    count: pois.length,
    pois,
  })
}
