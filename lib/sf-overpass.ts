export const OVERPASS_INTERPRETER = 'https://overpass-api.de/api/interpreter'

export const OVERPASS_USER_AGENT =
  'GelosOS/1.0 (Overpass scan; +https://github.com/)'

export type OverpassScanCategory =
  | 'pharmacy'
  | 'dentist'
  | 'supermarket'
  | 'mall_plaza'

/** OSM tag predicates used in Overpass `around` queries (union per category). */
const CATEGORY_FILTERS: Record<OverpassScanCategory, string[]> = {
  pharmacy: ['["amenity"="pharmacy"]'],
  dentist: ['["healthcare"="dentist"]', '["amenity"="dentist"]'],
  supermarket: ['["shop"="supermarket"]'],
  mall_plaza: [
    '["shop"="mall"]',
    '["amenity"="marketplace"]',
    '["place"="plaza"]',
  ],
}

export type OverpassPoiJson = {
  id: string
  osmType: 'node' | 'way' | 'relation'
  osmId: number
  name: string | null
  category: OverpassScanCategory
  lat: number
  lon: number
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function inferCategory(
  tags: Record<string, string>,
  allowed: Set<OverpassScanCategory>,
): OverpassScanCategory | null {
  const a = tags.amenity
  const s = tags.shop
  const h = tags.healthcare
  const p = tags.place

  if (allowed.has('pharmacy') && a === 'pharmacy') return 'pharmacy'
  if (
    allowed.has('dentist') &&
    (h === 'dentist' || a === 'dentist')
  ) {
    return 'dentist'
  }
  if (allowed.has('supermarket') && s === 'supermarket') return 'supermarket'
  if (allowed.has('mall_plaza')) {
    if (s === 'mall') return 'mall_plaza'
    if (a === 'marketplace') return 'mall_plaza'
    if (p === 'plaza') return 'mall_plaza'
  }
  return null
}

function pickName(tags: Record<string, string>): string | null {
  const n =
    tags.name ||
    tags['name:en'] ||
    tags['name:fr'] ||
    tags.brand ||
    tags.operator
  const t = n?.trim()
  return t && t.length > 0 ? t.slice(0, 200) : null
}

export function buildAroundQuery(
  lat: number,
  lon: number,
  radiusMeters: number,
  categories: OverpassScanCategory[],
): string {
  const allowed = new Set(categories)
  const lines: string[] = []
  for (const cat of categories) {
    for (const pred of CATEGORY_FILTERS[cat]) {
      lines.push(
        `node${pred}(around:${radiusMeters},${lat},${lon});`,
        `way${pred}(around:${radiusMeters},${lat},${lon});`,
        `relation${pred}(around:${radiusMeters},${lat},${lon});`,
      )
    }
  }
  return `[out:json][timeout:25];
(
${lines.join('\n')}
);
out center;`
}

const MAX_RESULTS = 250

export function parseOverpassElements(
  raw: unknown,
  allowedCategories: OverpassScanCategory[],
): OverpassPoiJson[] {
  if (!raw || typeof raw !== 'object') return []
  const elements = (raw as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return []

  const allowed = new Set(allowedCategories)
  const seen = new Set<string>()
  const out: OverpassPoiJson[] = []

  for (const el of elements as OverpassElement[]) {
    if (!el || typeof el !== 'object') continue
    if (el.type !== 'node' && el.type !== 'way' && el.type !== 'relation') {
      continue
    }
    const tags = el.tags ?? {}
    const category = inferCategory(tags, allowed)
    if (!category) continue

    let lat: number
    let lon: number
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      lat = el.lat
      lon = el.lon
    } else if (el.center?.lat != null && el.center?.lon != null) {
      lat = el.center.lat
      lon = el.center.lon
    } else {
      continue
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const dedupeKey = `${Math.round(lat * 1e5)}/${Math.round(lon * 1e5)}/${category}/${pickName(tags) ?? ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    out.push({
      id: `${el.type}/${el.id}`,
      osmType: el.type,
      osmId: el.id,
      name: pickName(tags),
      category,
      lat,
      lon,
    })

    if (out.length >= MAX_RESULTS) break
  }

  return out
}

export const SCAN_CATEGORY_LABELS: Record<OverpassScanCategory, string> = {
  pharmacy: 'Pharmacy',
  dentist: 'Dental clinic',
  supermarket: 'Supermarket',
  mall_plaza: 'Mall / plaza',
}
