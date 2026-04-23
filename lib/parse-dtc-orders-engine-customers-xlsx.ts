import { parseOrderDateCell } from '@/lib/dtc-customer-sheet-dates'
import * as XLSX from 'xlsx'

export type DtcOrdersEngineCustomerImportRow = {
  customerName: string
  phoneNumber?: string
  totalOrders?: number
  totalBilledGhs?: number
  totalCollectedGhs?: number
  location?: string
  returned?: number
  firstOrderAt?: Date
  lastOrderAt?: Date
}

type ImportRow = Record<string, unknown>

const normalizeHeader = (h: unknown) =>
  String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const headerKeyMatches = (nk: string, want: string) =>
  nk === want || nk.startsWith(`${want} `) || nk.startsWith(`${want}(`) || nk.startsWith(`${want} (`)

const get = (row: Record<string, unknown>, ...candidates: string[]) => {
  const wants = candidates.map((c) => normalizeHeader(c)).filter(Boolean)
  for (const k of Object.keys(row)) {
    const nk = normalizeHeader(k)
    if (!nk) continue
    for (const want of wants) {
      if (headerKeyMatches(nk, want)) return row[k]
    }
  }
  return undefined
}

const parseMoney = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').trim()
  if (!s) return undefined
  const n = Number(s.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const parseIntSafe = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const s = String(v ?? '').trim()
  if (!s) return undefined
  const n = Number.parseFloat(s.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function isoToDate(iso: string | undefined) {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function parseDtcOrdersEngineCustomersXlsxBuffer(
  buf: ArrayBuffer,
  sheetYear: number = new Date().getFullYear(),
):
  | {
      ok: true
      rows: DtcOrdersEngineCustomerImportRow[]
      stats: { dataRowsInRange: number; rowsImported: number; droppedEmptyCustomer: number }
    }
  | { ok: false; error: string } {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true, cellText: true })
  } catch {
    return { ok: false, error: 'Could not read this file as Excel (.xlsx).' }
  }

  const sheet = wb.Sheets['Customers'] ?? wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) return { ok: false, error: 'No sheets found in this file.' }

  const json = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' })
  if (!Array.isArray(json) || json.length === 0) {
    return { ok: false, error: 'No rows found in this sheet.' }
  }

  const out: DtcOrdersEngineCustomerImportRow[] = []
  let dropped = 0
  for (const r of json) {
    const customerName = String(get(r, 'customer name', 'customer', 'name') ?? '').trim()
    if (!customerName) {
      dropped++
      continue
    }
    const phoneNumber = String(get(r, 'phone number', 'phone') ?? '').trim()
    const totalOrders = parseIntSafe(get(r, 'total orders', 'orders') ?? '')
    const totalBilledGhs = parseMoney(get(r, 'total billed', 'total billed (ghc)', 'total billed (ghs)') ?? '')
    const totalCollectedGhs = parseMoney(
      get(r, 'total collected', 'total collected (ghc)', 'total collected (ghs)') ?? '',
    )
    const location = String(get(r, 'location') ?? '').trim()
    // "Returned" is a count (times an item was returned), not a currency.
    const returned = parseIntSafe(get(r, 'returned') ?? '')

    const firstIso = parseOrderDateCell(get(r, 'first order date', 'first order') ?? '', sheetYear)
    const lastIso = parseOrderDateCell(get(r, 'last order date', 'last order') ?? '', sheetYear)

    out.push({
      customerName,
      phoneNumber: phoneNumber || undefined,
      totalOrders,
      totalBilledGhs,
      totalCollectedGhs,
      location: location || undefined,
      returned: returned == null ? undefined : Number(returned),
      firstOrderAt: isoToDate(firstIso),
      lastOrderAt: isoToDate(lastIso),
    })
  }

  if (out.length === 0) {
    return { ok: false, error: 'No valid rows found (need Customer Name column).' }
  }

  return {
    ok: true,
    rows: out,
    stats: {
      dataRowsInRange: json.length,
      rowsImported: out.length,
      droppedEmptyCustomer: Math.max(0, json.length - out.length),
    },
  }
}

