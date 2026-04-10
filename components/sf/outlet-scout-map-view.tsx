'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Navigation, Radar, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ScoutMapOutlet } from '@/components/sf/outlet-scout-map-inner'
import type { OverpassPoiJson, OverpassScanCategory } from '@/lib/sf-overpass'
import { SCAN_CATEGORY_LABELS } from '@/lib/sf-overpass'
import type { ScoutOutletStatus } from '@/lib/sf-outlet-scouting'

const OutletScoutMapInner = dynamic(
  () =>
    import('./outlet-scout-map-inner').then((m) => ({ default: m.OutletScoutMapInner })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)

const STATUS_OPTIONS: { value: ScoutOutletStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'in_review', label: 'In review' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

const SCAN_CATEGORY_KEYS = [
  'pharmacy',
  'dentist',
  'supermarket',
  'mall_plaza',
] as const satisfies readonly OverpassScanCategory[]

const DEFAULT_SCAN_CATS: Record<OverpassScanCategory, boolean> = {
  pharmacy: true,
  dentist: true,
  supermarket: true,
  mall_plaza: true,
}

function statusBadge(s: ScoutOutletStatus) {
  switch (s) {
    case 'won':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Won</Badge>
    case 'lost':
      return <Badge variant="secondary">Lost</Badge>
    case 'qualified':
      return <Badge className="bg-blue-600 hover:bg-blue-600">Qualified</Badge>
    case 'in_review':
      return <Badge variant="outline">In review</Badge>
    default:
      return <Badge variant="outline">Lead</Badge>
  }
}

export function OutletScoutMapView() {
  const [loading, setLoading] = useState(true)
  const [outlets, setOutlets] = useState<ScoutMapOutlet[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [pinningId, setPinningId] = useState<string | null>(null)

  const [scanLocation, setScanLocation] = useState('')
  const [scanRadius, setScanRadius] = useState('2500')
  const [scanCats, setScanCats] = useState(DEFAULT_SCAN_CATS)
  const [scanPois, setScanPois] = useState<OverpassPoiJson[]>([])
  const [scanMeta, setScanMeta] = useState<{
    geocodedLabel: string | null
    radiusMeters: number
    count: number
  } | null>(null)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q =
        statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const res = await fetch(`/api/sf/scouted-outlets${q}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { outlets: ScoutMapOutlet[] }
      setOutlets(data.outlets)
    } catch {
      toast.error('Could not load scouted outlets')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return outlets
    return outlets.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.area.toLowerCase().includes(q) ||
        o.scoutedBy.toLowerCase().includes(q),
    )
  }, [outlets, query])

  const pinnedCount = useMemo(
    () => outlets.filter((o) => o.latitude != null && o.longitude != null).length,
    [outlets],
  )

  const selectedCategories = useMemo(
    () => SCAN_CATEGORY_KEYS.filter((k) => scanCats[k]),
    [scanCats],
  )

  async function runOverpassScan() {
    const loc = scanLocation.trim()
    if (loc.length < 2) {
      toast.error('Enter an area or place to scan')
      return
    }
    if (selectedCategories.length === 0) {
      toast.error('Select at least one category')
      return
    }
    const radius = Number(scanRadius)
    if (!Number.isFinite(radius)) {
      toast.error('Invalid radius')
      return
    }

    setScanning(true)
    try {
      const res = await fetch('/api/sf/overpass-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationQuery: loc,
          radiusMeters: radius,
          categories: selectedCategories,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (res.status === 404) {
        toast.error('Could not geocode that location')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(err.error ?? 'Scan failed')
        return
      }
      const data = (await res.json()) as {
        center: { lat: number; lon: number }
        radiusMeters: number
        geocodedLabel: string | null
        count: number
        pois: OverpassPoiJson[]
      }
      setScanPois(data.pois)
      setScanMeta({
        geocodedLabel: data.geocodedLabel,
        radiusMeters: data.radiusMeters,
        count: data.count,
      })
      toast.success(
        data.count === 0
          ? 'No OSM places matched in that radius'
          : `Found ${data.count} place(s) from OpenStreetMap`,
      )
    } catch {
      toast.error('Could not run Overpass scan')
    } finally {
      setScanning(false)
    }
  }

  function clearScan() {
    setScanPois([])
    setScanMeta(null)
  }

  async function geocodeAndPin(o: ScoutMapOutlet) {
    setPinningId(o.id)
    try {
      const gq = `${o.name}, ${o.area}, Ghana`
      const g = await fetch(
        `/api/sf/geocode?q=${encodeURIComponent(gq)}`,
        { credentials: 'include' },
      )
      if (g.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (g.status === 404) {
        toast.error('No geocode result — try a clearer name or area')
        return
      }
      if (!g.ok) {
        toast.error('Geocode failed')
        return
      }
      const { lat, lon } = (await g.json()) as { lat: number; lon: number }
      const patch = await fetch(`/api/sf/scouted-outlets/${o.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      })
      if (!patch.ok) {
        toast.error('Could not save pin')
        return
      }
      toast.success('Outlet pinned on map')
      void load()
    } catch {
      toast.error('Could not pin outlet')
    } finally {
      setPinningId(null)
    }
  }

  async function removePin(id: string) {
    try {
      const res = await fetch(`/api/sf/scouted-outlets/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: null, longitude: null }),
      })
      if (!res.ok) {
        toast.error('Could not remove pin')
        return
      }
      toast.success('Pin removed')
      void load()
    } catch {
      toast.error('Could not remove pin')
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Outlet Scout Map"
        description="Scan OpenStreetMap (Overpass) for pharmacies, dental clinics, supermarkets, and malls near a place, then compare with your scouted outlets. Geocoding uses Nominatim; respect OSM usage policies in production."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/sf/outlet-scouting">Outlet Scouting</Link>
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:p-6">
        <div className="flex w-full flex-col gap-4 sm:max-w-sm sm:shrink-0">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Area scan (Overpass)</p>
              </div>
              {scanMeta ? (
                <Badge variant="secondary" className="tabular-nums">
                  {scanMeta.count} OSM
                </Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="scan-loc">Location</Label>
                <Input
                  id="scan-loc"
                  placeholder="e.g. Osu, Accra or East Legon"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                />
                {scanMeta?.geocodedLabel ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    Center: {scanMeta.geocodedLabel}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Radius</Label>
                <Select value={scanRadius} onValueChange={setScanRadius}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1000">1 km</SelectItem>
                    <SelectItem value="2500">2.5 km</SelectItem>
                    <SelectItem value="5000">5 km</SelectItem>
                    <SelectItem value="7000">7 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Categories</p>
                <div className="grid gap-2">
                  {SCAN_CATEGORY_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={scanCats[key]}
                        onCheckedChange={(v) =>
                          setScanCats((c) => ({ ...c, [key]: v === true }))
                        }
                        id={`scan-cat-${key}`}
                      />
                      <span className="leading-none">{SCAN_CATEGORY_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={scanning}
                  onClick={() => void runOverpassScan()}
                >
                  {scanning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Radar className="h-4 w-4" />
                  )}
                  Scan area
                </Button>
                {scanPois.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={clearScan}
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear OSM
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Data © OpenStreetMap contributors. Public Overpass endpoints are
                rate-limited; cache or self-host for heavy use.
              </p>
            </div>
          </Card>

          <Card className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-3 border-b p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Scouted outlets</p>
                <span className="text-xs text-muted-foreground">
                  {pinnedCount} pinned / {outlets.length}
                </span>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="map-search" className="text-muted-foreground">
                  Search
                </Label>
                <Input
                  id="map-search"
                  placeholder="Name, area, scout…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  No outlets match.
                </p>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((o) => {
                    const hasPin = o.latitude != null && o.longitude != null
                    return (
                      <li key={o.id}>
                        <div className="rounded-md border border-transparent px-2 py-2 hover:bg-muted/60">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{o.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {o.area}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {statusBadge(o.status)}
                                {hasPin ? (
                                  <Badge variant="outline" className="text-xs">
                                    <MapPin className="mr-0.5 h-3 w-3" />
                                    Map
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              {hasPin ? null : (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 gap-1 px-2 text-xs"
                                  disabled={pinningId === o.id}
                                  onClick={() => void geocodeAndPin(o)}
                                >
                                  {pinningId === o.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Navigation className="h-3.5 w-3.5" />
                                  )}
                                  Pin
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="relative h-[min(70vh,560px)] min-h-[320px] flex-1">
          <OutletScoutMapInner
            outlets={outlets}
            scanPois={scanPois}
            onRemovePin={(id) => void removePin(id)}
          />
        </div>
      </div>
    </div>
  )
}
