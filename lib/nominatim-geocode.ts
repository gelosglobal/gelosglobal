const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export const NOMINATIM_USER_AGENT =
  'GelosOS/1.0 (internal geocode; +https://github.com/)'

export async function nominatimSearchFirst(q: string): Promise<{
  lat: number
  lon: number
  label: string | null
} | null> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return null

  const url = new URL(NOMINATIM)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('q', trimmed)

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_USER_AGENT,
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) return null

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }

  if (!Array.isArray(data) || data.length === 0) return null

  const row = data[0] as { lat?: string; lon?: string; display_name?: string }
  const lat = row.lat != null ? Number(row.lat) : NaN
  const lon = row.lon != null ? Number(row.lon) : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    lat,
    lon,
    label: typeof row.display_name === 'string' ? row.display_name : null,
  }
}
