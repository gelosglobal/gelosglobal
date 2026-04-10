'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  OverpassPoiJson,
  OverpassScanCategory,
} from '@/lib/sf-overpass'
import { SCAN_CATEGORY_LABELS } from '@/lib/sf-overpass'
import type { ScoutOutletStatus, ScoutPriority } from '@/lib/sf-outlet-scouting'

export type ScoutMapOutlet = {
  id: string
  name: string
  area: string
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  latitude: number | null
  longitude: number | null
}

const DEFAULT_CENTER: [number, number] = [5.6037, -0.187]

const STATUS_COLOR: Record<ScoutOutletStatus, string> = {
  lead: '#64748b',
  qualified: '#2563eb',
  in_review: '#9333ea',
  won: '#16a34a',
  lost: '#94a3b8',
}

const SCAN_MARKER_COLOR: Record<OverpassScanCategory, string> = {
  pharmacy: '#059669',
  dentist: '#7c3aed',
  supermarket: '#ea580c',
  mall_plaza: '#db2777',
}

function statusLabel(s: ScoutOutletStatus) {
  return s.replace(/_/g, ' ')
}

function osmBrowseUrl(p: OverpassPoiJson) {
  return `https://www.openstreetmap.org/${p.osmType}/${p.osmId}`
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) {
      map.setView(DEFAULT_CENTER, 11)
      return
    }
    if (positions.length === 1) {
      map.setView(positions[0], 14)
      return
    }
    const b = L.latLngBounds(positions)
    if (b.isValid()) {
      map.fitBounds(b, { padding: [56, 56], maxZoom: 15 })
    }
  }, [map, positions])
  return null
}

export function OutletScoutMapInner({
  outlets,
  scanPois,
  onRemovePin,
}: {
  outlets: ScoutMapOutlet[]
  scanPois: OverpassPoiJson[]
  onRemovePin?: (id: string) => void
}) {
  const positions = useMemo(() => {
    const p: [number, number][] = []
    for (const o of outlets) {
      if (o.latitude != null && o.longitude != null) {
        p.push([o.latitude, o.longitude])
      }
    }
    for (const s of scanPois) {
      p.push([s.lat, s.lon])
    }
    return p
  }, [outlets, scanPois])

  const pinned = outlets.filter((o) => o.latitude != null && o.longitude != null)

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={11}
      className="z-0 h-full min-h-[320px] w-full rounded-lg border border-border bg-muted/20"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />
      {scanPois.map((p) => (
        <CircleMarker
          key={`osm-${p.id}`}
          center={[p.lat, p.lon]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: SCAN_MARKER_COLOR[p.category],
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <div className="min-w-[200px] space-y-1 text-sm">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {SCAN_CATEGORY_LABELS[p.category]}
              </p>
              <p className="font-semibold leading-tight">
                {p.name ?? 'Unnamed (OSM)'}
              </p>
              <a
                className="text-xs text-primary underline"
                href={osmBrowseUrl(p)}
                target="_blank"
                rel="noreferrer"
              >
                View on OpenStreetMap
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {pinned.map((o) => (
        <CircleMarker
          key={o.id}
          center={[o.latitude!, o.longitude!]}
          radius={10}
          pathOptions={{
            color: STATUS_COLOR[o.status],
            fillColor: STATUS_COLOR[o.status],
            fillOpacity: 0.88,
            weight: 2,
          }}
        >
          <Popup>
            <div className="min-w-[200px] space-y-1 text-sm">
              <p className="font-semibold leading-tight">{o.name}</p>
              <p className="text-muted-foreground">{o.area}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {statusLabel(o.status)} · {o.priority} · {o.scoutedBy}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link className="text-primary underline" href="/sf/outlet-scouting">
                  Open scouting list
                </Link>
                {onRemovePin ? (
                  <button
                    type="button"
                    className="text-xs text-destructive underline"
                    onClick={() => onRemovePin(o.id)}
                  >
                    Remove pin
                  </button>
                ) : null}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
