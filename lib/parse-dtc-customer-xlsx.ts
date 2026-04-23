import { parseOrderDateCell } from '@/lib/dtc-customer-sheet-dates'
import * as XLSX from 'xlsx'

type ImportRow = Record<string, unknown>

/**
 * Union of declared `!ref` and the true bounding box of every A1-style cell on the sheet.
 * Without this, right-hand columns (totals, dates) are often never read.
 */
function mergeWorksheetRefWithPresentCells(sheet: XLSX.WorkSheet) {
  let sR = 1e6
  let sC = 1e6
  let eR = -1
  let eC = -1
  let have = false
  for (const k of Object.keys(sheet)) {
    if (k[0] === '!') continue
    let addr: { r: number; c: number }
    try {
      addr = XLSX.utils.decode_cell(k)
    } catch {
      continue
    }
    have = true
    sR = Math.min(sR, addr.r)
    sC = Math.min(sC, addr.c)
    eR = Math.max(eR, addr.r)
    eC = Math.max(eC, addr.c)
  }
  if (!have) return
  if (sheet['!ref']) {
    const b = XLSX.utils.decode_range(sheet['!ref'])
    sR = Math.min(sR, b.s.r)
    sC = Math.min(sC, b.s.c)
    eR = Math.max(eR, b.e.r)
    eC = Math.max(eC, b.e.c)
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: sR, c: sC }, e: { r: eR, c: eC } })
}

/**
 * Excel can define a table / AutoFilter range bigger than the dense cell set used for `!ref`.
 * Union that range so we still iterate every visible row the sheet author intended.
 */
function expandRefWithAutofilter(sheet: XLSX.WorkSheet) {
  const af = (sheet as { '!autofilter'?: { ref: string } })['!autofilter']
  if (!af?.ref) return
  try {
    const d = XLSX.utils.decode_range(af.ref)
    if (!sheet['!ref']) {
      sheet['!ref'] = XLSX.utils.encode_range(d)
      return
    }
    const b = XLSX.utils.decode_range(sheet['!ref'])
    sheet['!ref'] = XLSX.utils.encode_range({
      s: { r: Math.min(b.s.r, d.s.r), c: Math.min(b.s.c, d.s.c) },
      e: { r: Math.max(b.e.r, d.e.r), c: Math.max(b.e.c, d.e.c) },
    })
  } catch {
    /* ignore */
  }
}

export type DtcParseStats = {
  /** Rows in the read range (below header) */
  dataRowsInRange: number
  /** Rows that produced a valid `customer` after parse */
  rowsImported: number
  /** `dataRowsInRange` - rowsImported (blank name column, etc.) */
  droppedEmptyCustomer: number
}

/**
 * Server-side DTC customer workbook parse (SheetJS + matrix rows).
 * Same rules as the former client `handleImportExcel` so behavior stays aligned.
 */
export function parseDtcCustomerXlsxBuffer(
  buf: ArrayBuffer,
  sheetYear: number = new Date().getFullYear(),
):
  | { ok: true; rows: ImportRow[]; replaceIntelFields: boolean; stats: DtcParseStats }
  | { ok: false; error: string } {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true, cellText: true })
  } catch {
    return { ok: false, error: 'Could not read this file as Excel (.xlsx).' }
  }

  const sheet = wb.Sheets['Customers'] ?? wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) {
    return { ok: false, error: 'No sheets found in this file.' }
  }

  /**
   * `!ref` in many workbooks is wrong or too small; cells *outside* it are invisible
   * to any logic that only walks `decode_range(sheet['!ref'])` (see SheetJS #1601).
   */
  mergeWorksheetRefWithPresentCells(sheet)
  expandRefWithAutofilter(sheet)

  const cellTxt = (v: unknown) => String(v ?? '').trim()

  const normalizeHeader = (h: unknown) =>
    String(h ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const headerKeyMatches = (nk: string, want: string) =>
    nk === want ||
    nk.startsWith(`${want} `) ||
    nk.startsWith(`${want}(`) ||
    nk.startsWith(`${want} (`)

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

  const INTEL_LABELS = [
    'customer name',
    'phone number',
    'total orders',
    'total billed',
    'total billed (ghc)',
    'total billed (ghs)',
    'total collected',
    'total collected (ghc)',
    'total collected (ghs)',
    'location',
    'returned',
    'first order date',
    'last order date',
  ] as const

  const cellMatchesLabelNorm = (cell: string, wantRaw: string) => {
    const w = normalizeHeader(wantRaw)
    if (!w || !cell) return false
    return (
      cell === w ||
      cell.startsWith(`${w} `) ||
      cell.startsWith(`${w}(`) ||
      cell.startsWith(`${w} (`)
    )
  }

  const intelHeaderScore = (row: unknown[]) => {
    const cells = row.map((h) => normalizeHeader(h)).filter(Boolean)
    let score = 0
    for (const want of INTEL_LABELS) {
      if (cells.some((c) => cellMatchesLabelNorm(c, want))) score++
    }
    return score
  }

  const findIntelHeaderIdx = (aoa: unknown[][]) => {
    let best = -1
    let bestScore = 0
    const scan = Math.min(aoa.length, 45)
    for (let i = 0; i < scan; i++) {
      const s = intelHeaderScore(aoa[i] ?? [])
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    }
    return bestScore >= 7 ? best : -1
  }

  const findCol = (headerRow: unknown[], ...aliases: string[]) => {
    const keys = headerRow.map((h) => normalizeHeader(h))
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (!k) continue
      for (const a of aliases) {
        if (cellMatchesLabelNorm(k, a)) return i
      }
    }
    return -1
  }

  /**
   * One physical row, every column in [c0, c1], so indices match `findCol` and never
   * drift (SheetJS array rows are often *shorter* than the real grid → wrong totals/dates).
   */
  const readRowFromGrid = (
    sh: XLSX.WorkSheet,
    rowR: number,
    c0: number,
    c1: number,
  ): unknown[] => {
    const out: unknown[] = []
    for (let c = c0; c <= c1; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowR, c })
      const cell = sh[addr] as { t?: string; v?: unknown; w?: string } | undefined
      if (!cell || (cell as { t?: string }).t === 'z') {
        out.push('')
        continue
      }
      if (typeof cell.w === 'string' && cell.w.trim() !== '') {
        out.push(cell.w.trim())
        continue
      }
      if (cell.t === 'b') {
        out.push(cell.v)
        continue
      }
      if (cell.t === 's' || cell.t === 'str') {
        if (typeof cell.v === 'string') out.push(cell.v)
        else out.push('')
        continue
      }
      if (cell.t === 'n' || cell.t === 'd') {
        out.push(cell.v)
        continue
      }
      if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
        out.push(cell.v)
        continue
      }
      if (cell.v instanceof Date) {
        out.push(cell.v)
        continue
      }
      if (cell.v != null && cell.v !== '') {
        out.push(cell.v)
      } else {
        out.push('')
      }
    }
    return out
  }

  const buildImportRowFromWideObject = (r: Record<string, unknown>): ImportRow | null => {
    const customer = String(
      get(r, 'customer', 'customer name', 'name', 'full name') ??
        r.customer ??
        r.Customer ??
        r.name ??
        r.Name ??
        '',
    ).trim()
    if (!customer) return null
    const phone = String(
      get(r, 'phone', 'phone number', 'number', 'mobile') ?? r.phone ?? r.Phone ?? '',
    ).trim()
    const email = String(get(r, 'email') ?? r.email ?? r.Email ?? '').trim()
    const location = String(get(r, 'location') ?? r.location ?? r.Location ?? '').trim()
    const riderAssigned = String(get(r, 'rider assigned', 'rider', 'assigned rider') ?? '').trim()
    const amountToBeCollectedGhs = parseMoney(
      get(r, 'amount to be collected', 'amount_to_be_collected') ?? '',
    )
    const acCashCollectedGhs = parseMoney(get(r, 'ac cash collected', 'ac cash') ?? '')
    const acMomoGhs = parseMoney(get(r, 'ac momo', 'acmomo') ?? '')
    const acPaystackGhs = parseMoney(get(r, 'ac paystack', 'paystack') ?? '')
    const remarks = String(get(r, 'remarks', 'remark', 'notes') ?? '').trim()

    const importTotalOrders = parseIntSafe(get(r, 'total orders', 'orders', 'order count') ?? '')
    const importTotalBilledGhs = parseMoney(
      get(
        r,
        'total billed',
        'total billed ghc',
        'total billed ghs',
        'total billed (ghc)',
        'total billed (ghs)',
        'billed',
        'total bill',
      ) ?? '',
    )
    const importTotalCollectedGhs = parseMoney(
      get(
        r,
        'total collected',
        'total collected ghc',
        'total collected ghs',
        'total collected (ghc)',
        'total collected (ghs)',
        'collected',
      ) ?? '',
    )
    const retRaw = get(r, 'returned', 'returns') ?? ''
    const importReturnedCount = parseIntSafe(retRaw)
    const importReturnedGhs = importReturnedCount == null ? parseMoney(retRaw) : undefined
    const importFirstOrderAt = parseOrderDateCell(
      get(r, 'first order date', 'first order') ?? '',
      sheetYear,
    )
    const importLastOrderAt = parseOrderDateCell(
      get(r, 'last order date', 'last order') ?? '',
      sheetYear,
    )

    const row: ImportRow = {
      customer,
      phone: phone || undefined,
      email: email || undefined,
      location: location || undefined,
      source: undefined,
      joinDate: undefined,
      segment: undefined,
      riderAssigned: riderAssigned || undefined,
      amountToBeCollectedGhs,
      acCashCollectedGhs,
      acMomoGhs,
      acPaystackGhs,
      remarks: remarks || undefined,
    }
    if (importTotalOrders != null) row.importTotalOrders = importTotalOrders
    if (importTotalBilledGhs != null) row.importTotalBilledGhs = importTotalBilledGhs
    if (importTotalCollectedGhs != null) row.importTotalCollectedGhs = importTotalCollectedGhs
    if (importReturnedCount !== undefined && importReturnedCount !== null) {
      row.importReturnedCount = importReturnedCount
    } else if (importReturnedGhs != null) {
      row.importReturnedGhs = importReturnedGhs
    }
    if (importFirstOrderAt) row.importFirstOrderAt = importFirstOrderAt
    if (importLastOrderAt) row.importLastOrderAt = importLastOrderAt
    return row
  }

  const colAliases = {
    name: ['customer name', 'customer', 'full name', 'name'] as const,
    phone: ['phone number', 'phone', 'mobile number', 'mobile', 'tel'] as const,
    orders: [
      'total orders',
      'total order',
      'orders total',
      'order count',
      'orders count',
      'no of orders',
      'total no of orders',
      'number of orders',
      'order qty',
      'qty',
      'orders',
    ] as const,
    billed: [
      'total billed',
      'total billed (ghc)',
      'total billed (ghs)',
      'total bill',
      'billed total',
      'bill total',
      'total billing',
      'amount billed',
      'billed (ghc)',
      'billed (ghs)',
      'billed in ghs',
      'billed in ghc',
      'billed',
    ] as const,
    collected: [
      'total collected',
      'total collected (ghc)',
      'total collected (ghs)',
      'collected total',
      'amount collected',
      'total amount collected',
      'collected (ghc)',
      'collected (ghs)',
      'collected in ghs',
      'collected in ghc',
      'collected',
    ] as const,
    loc: ['location', 'area', 'region'] as const,
    ret: ['returned', 'returns', 'return', 'returns amount'] as const,
    first: [
      'first order date',
      'first order',
      'first purchase date',
      'first purchase',
      'first ordered',
    ] as const,
    last: [
      'last order date',
      'last order',
      'last purchase date',
      'last purchase',
      'last ordered',
    ] as const,
  }

  const fillRowFromArr = (
    rowArr: unknown[],
    iName: number,
    iPhone: number,
    iOrders: number,
    iBilled: number,
    iCollected: number,
    iLoc: number,
    iRet: number,
    iFirst: number,
    iLast: number,
  ): ImportRow | null => {
    const customer = cellTxt(rowArr[iName])
    if (!customer) return null
    const phone = iPhone >= 0 ? cellTxt(rowArr[iPhone]) : ''
    const row: ImportRow = {
      customer,
      phone: phone || undefined,
      location: iLoc >= 0 ? cellTxt(rowArr[iLoc]) || undefined : undefined,
    }
    if (iOrders >= 0) {
      const raw = rowArr[iOrders]
      let n = parseIntSafe(raw)
      if (n == null) {
        const m = parseMoney(raw)
        if (m != null) n = Math.trunc(m)
      }
      if (n != null) row.importTotalOrders = n
    }
    if (iBilled >= 0) {
      const n = parseMoney(rowArr[iBilled])
      if (n != null) row.importTotalBilledGhs = n
    }
    if (iCollected >= 0) {
      const n = parseMoney(rowArr[iCollected])
      if (n != null) row.importTotalCollectedGhs = n
    }
    if (iRet >= 0) {
      const intVal = parseIntSafe(rowArr[iRet])
      if (intVal != null) row.importReturnedCount = intVal
      else {
        const m = parseMoney(rowArr[iRet])
        if (m != null) row.importReturnedGhs = m
      }
    }
    if (iFirst >= 0) {
      const iso = parseOrderDateCell(rowArr[iFirst], sheetYear)
      if (iso) row.importFirstOrderAt = iso
    }
    if (iLast >= 0) {
      const iso = parseOrderDateCell(rowArr[iLast], sheetYear)
      if (iso) row.importLastOrderAt = iso
    }
    return row
  }

  const mapIntelHeaderRow = (hr: unknown[]) => ({
    iName: findCol(hr, ...colAliases.name),
    iPhone: findCol(hr, ...colAliases.phone),
    iOrders: findCol(hr, ...colAliases.orders),
    iBilled: findCol(hr, ...colAliases.billed),
    iCollected: findCol(hr, ...colAliases.collected),
    iLoc: findCol(hr, ...colAliases.loc),
    iRet: findCol(hr, ...colAliases.ret),
    iFirst: findCol(hr, ...colAliases.first),
    iLast: findCol(hr, ...colAliases.last),
  })

  type IntelIdx = ReturnType<typeof mapIntelHeaderRow>

  /**
   * A–I template. Prefer column D as “billed” + E as “collected”; if D1 is **empty** (merged header),
   * still lock 0–8 when A/B and C(orders) + E(collected) are recognizable — data in D row cells is
   * still at index 3.
   */
  const tryStandardNineIntelligenceByHeaderShape = (hr: unknown[]): IntelIdx | null => {
    if (hr.length < 9) return null
    const a = normalizeHeader(hr[0] ?? '')
    const b = normalizeHeader(hr[1] ?? '')
    const c2 = normalizeHeader(hr[2] ?? '')
    const d = normalizeHeader(hr[3] ?? '')
    const e = normalizeHeader(hr[4] ?? '')

    const aOk = (a.includes('customer') && a.includes('name')) || a === 'name' || a === 'customer name'
    const bOk =
      b.includes('phone') ||
      b.includes('mobile') ||
      b.includes('tel') ||
      (b.includes('number') && (b.includes('phone') || b.includes('cell') || b.includes('mobile')))
    if (!aOk || !bOk) return null

    const c2OrdersLike =
      !c2 ||
      c2 === 'order' ||
      c2 === 'orders' ||
      c2 === 'total orders' ||
      (c2.includes('order') && c2.includes('total') && !c2.includes('date')) ||
      (c2.includes('order') && !c2.includes('date') && !c2.includes('first') && !c2.includes('last')) ||
      c2.includes('order count') ||
      c2.includes('no of order')

    const eIsCollected =
      (e && !e.includes('uncollected') && !e.includes('unbilled') && e.includes('collected')) ||
      (e && e.includes('collect') && (e.includes('total') || e.includes('ghc') || e.includes('ghs')))

    const dIsBilled =
      d &&
      !d.includes('unbilled') &&
      !d.includes('collected') &&
      (d.includes('billed') || (d.includes('bill') && d.includes('total')))

    const std: IntelIdx = {
      iName: 0,
      iPhone: 1,
      iOrders: 2,
      iBilled: 3,
      iCollected: 4,
      iLoc: 5,
      iRet: 6,
      iFirst: 7,
      iLast: 8,
    }
    if (dIsBilled && eIsCollected) return std
    if (eIsCollected && c2OrdersLike && !d) return std
    return null
  }

  /**
   * Exact `findCol` often misses real exports (“Bill total”, “Invoiced”, “# Orders”, etc.).
   * Fills only indices that are still -1, left-to-right, without reusing a column.
   */
  const fuzzyFillMissingIntelColumns = (hr: unknown[], idx: IntelIdx): IntelIdx => {
    const keys = hr.map((h) => normalizeHeader(h))
    const used = new Set(
      [idx.iName, idx.iPhone, idx.iOrders, idx.iBilled, idx.iCollected, idx.iLoc, idx.iRet, idx.iFirst, idx.iLast].filter(
        (i) => i >= 0,
      ),
    )

    const firstUnused = (pred: (k: string) => boolean): number => {
      for (let i = 0; i < keys.length; i++) {
        if (used.has(i) || !keys[i]) continue
        if (pred(keys[i])) {
          used.add(i)
          return i
        }
      }
      return -1
    }

    const out = { ...idx }

    if (out.iOrders < 0) {
      out.iOrders = firstUnused((k) => {
        if (k.includes('date') && (k.includes('first') || k.includes('last'))) return false
        if (k.includes('first order') && k.includes('date')) return false
        if (k.includes('last order') && k.includes('date')) return false
        if (k === 'order' || k === 'orders' || k === 'ord') return true
        if (k.includes('total order') || k.includes('order count') || k.includes('orders count')) return true
        if (k.includes('no of order') || k.includes('number of order') || k.includes('no of orders')) return true
        if (k.includes('order qty') || k === 'qty' || (k.includes('qty') && !k.includes('date') && k.includes('order'))) return true
        if (k.includes('order') && k.includes('date')) return false
        if (k.includes('order') && (k.includes('first') || k.includes('last'))) return false
        if (
          k.includes('order') &&
          (k.includes('no') || k.includes('count') || k.includes('number') || k.includes('#') || k.includes('qty'))
        ) {
          return true
        }
        return false
      })
    }

    if (out.iBilled < 0) {
      out.iBilled = firstUnused((k) => {
        if (k.includes('unbilled')) return false
        if (k.includes('billed')) return true
        if (k.includes('bill') && k.includes('collected')) return false
        if (k.includes('bill') && (k.includes('total') || k.includes('amount') || k.includes('ghs') || k.includes('ghc'))) return true
        if (k.includes('invoice') && (k.includes('total') || k.includes('amount') || k === 'invoiced')) return true
        if (k.includes('revenue') && (k.includes('total') || k.includes('gross'))) return true
        if (k === 'invoiced' || k === 'invoiced amount' || k === 'net billed') return true
        return false
      })
    }

    if (out.iCollected < 0) {
      out.iCollected = firstUnused((k) => {
        if (k.includes('to be collected')) return false
        if (k.includes('outstanding') && (k.includes('collect') || k.includes('collected'))) return false
        if (k.includes('uncollected')) return false
        if (k.includes('collected')) return true
        if (k.includes('collect') && (k.includes('total') || k.includes('amount') || k.includes('ghs') || k.includes('ghc'))) return true
        return false
      })
    }

    if (out.iRet < 0) {
      out.iRet = firstUnused(
        (k) =>
          k.includes('returned') ||
          k === 'return' ||
          k === 'returns' ||
          (k.includes('return') && !k.includes('turnover')),
      )
    }

    if (out.iFirst < 0) {
      out.iFirst = firstUnused(
        (k) =>
          (k.includes('first') && k.includes('date') && (k.includes('order') || k.includes('purchase'))) ||
          (k.includes('first order') && k.includes('date')) ||
          k === 'first order date' ||
          (k.startsWith('first') && k.includes('order') && k.includes('date')),
      )
    }

    if (out.iLast < 0) {
      out.iLast = firstUnused(
        (k) =>
          (k.includes('last') && k.includes('date') && (k.includes('order') || k.includes('purchase'))) ||
          (k.includes('last order') && k.includes('date')) ||
          k === 'last order date' ||
          (k.startsWith('last') && k.includes('order') && k.includes('date')),
      )
    }

    if (out.iLoc < 0) {
      out.iLoc = firstUnused(
        (k) => (k === 'location' || k === 'area' || k === 'region' || k === 'zone' || k === 'address'),
      )
    }

    return out
  }

  /** If headers sit in A–B but the rest of the “Customer intelligence” row is fixed-order. */
  const applyStandardNineColumnLayout = (hr: unknown[], idx: IntelIdx): IntelIdx => {
    if (hr.length < 9) return idx
    if (idx.iName !== 0 || idx.iPhone !== 1) return idx
    return {
      iName: 0,
      iPhone: 1,
      iOrders: idx.iOrders >= 0 ? idx.iOrders : 2,
      iBilled: idx.iBilled >= 0 ? idx.iBilled : 3,
      iCollected: idx.iCollected >= 0 ? idx.iCollected : 4,
      iLoc: idx.iLoc >= 0 ? idx.iLoc : 5,
      iRet: idx.iRet >= 0 ? idx.iRet : 6,
      iFirst: idx.iFirst >= 0 ? idx.iFirst : 7,
      iLast: idx.iLast >= 0 ? idx.iLast : 8,
    }
  }

  const findBestIntelHeaderRowR = (
    sh: XLSX.WorkSheet,
    c0: number,
    c1: number,
    sR: number,
    eR: number,
  ): number => {
    let bestR = -1
    let bestScore = 0
    const maxScan = Math.min(90, Math.max(0, eR - sR + 1))
    for (let o = 0; o < maxScan; o++) {
      const r = sR + o
      const row = readRowFromGrid(sh, r, c0, c1)
      const sc = intelHeaderScore(row)
      if (sc > bestScore) {
        bestScore = sc
        bestR = r
      }
    }
    if (bestScore < 4) return -1
    const hr = readRowFromGrid(sh, bestR, c0, c1)
    if (mapIntelHeaderRow(hr).iName < 0) return -1
    return bestR
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  let rows: ImportRow[] = []
  let replaceIntelFields = false
  let parseStats: DtcParseStats = { dataRowsInRange: 0, rowsImported: 0, droppedEmptyCustomer: 0 }
  const intelIdxFromAoa = findIntelHeaderIdx(aoa)

  if (sheet['!ref']) {
    const decoded = XLSX.utils.decode_range(sheet['!ref'])
    const c0 = decoded.s.c
    const c1 = decoded.e.c
    const sR = decoded.s.r
    const eR = decoded.e.r

    let headerAbsR = findBestIntelHeaderRowR(sheet, c0, c1, sR, eR)
    if (headerAbsR < 0 && intelIdxFromAoa >= 0) {
      headerAbsR = sR + intelIdxFromAoa
    }
    if (headerAbsR >= 0 && headerAbsR <= eR) {
      const hr = readRowFromGrid(sheet, headerAbsR, c0, c1)
      const strict9 = tryStandardNineIntelligenceByHeaderShape(hr)
      let idx: IntelIdx = strict9 ?? mapIntelHeaderRow(hr)
      if (!strict9) {
        idx = fuzzyFillMissingIntelColumns(hr, idx)
        idx = applyStandardNineColumnLayout(hr, idx)
      }
      if (idx.iName >= 0) {
        replaceIntelFields = true
        const next: ImportRow[] = []
        let dataRows = 0
        let dropped = 0
        for (let r = headerAbsR + 1; r <= eR; r++) {
          dataRows++
          const rowArr = readRowFromGrid(sheet, r, c0, c1)
          const one = fillRowFromArr(
            rowArr,
            idx.iName,
            idx.iPhone,
            idx.iOrders,
            idx.iBilled,
            idx.iCollected,
            idx.iLoc,
            idx.iRet,
            idx.iFirst,
            idx.iLast,
          )
          if (one) next.push(one)
          else dropped++
        }
        rows = next
        parseStats = {
          dataRowsInRange: dataRows,
          rowsImported: next.length,
          droppedEmptyCustomer: dropped,
        }
      }
    }
  }

  if (rows.length === 0 && intelIdxFromAoa >= 0) {
    const hr = aoa[intelIdxFromAoa] ?? []
    const width = Math.max(
      hr.length,
      ...aoa.slice(intelIdxFromAoa + 1).map((r) => (r as unknown[]).length),
    )
    const strict9 = tryStandardNineIntelligenceByHeaderShape(hr)
    let idx: IntelIdx = strict9 ?? mapIntelHeaderRow(hr)
    if (!strict9) {
      idx = fuzzyFillMissingIntelColumns(hr, idx)
      idx = applyStandardNineColumnLayout(hr, idx)
    }
    if (idx.iName >= 0) {
      replaceIntelFields = true
      const raw = aoa.slice(intelIdxFromAoa + 1)
      rows = raw
        .map((row) => {
          const rowArr = Array.from({ length: width }, (_, i) =>
            i < (row as unknown[]).length ? (row as unknown[])[i] : '',
          )
          return fillRowFromArr(
            rowArr,
            idx.iName,
            idx.iPhone,
            idx.iOrders,
            idx.iBilled,
            idx.iCollected,
            idx.iLoc,
            idx.iRet,
            idx.iFirst,
            idx.iLast,
          )
        })
        .filter((x): x is ImportRow => Boolean(x))
      parseStats = {
        dataRowsInRange: raw.length,
        rowsImported: rows.length,
        droppedEmptyCustomer: raw.length - rows.length,
      }
    }
  }

  if (rows.length === 0) {
    const headerRowIdx = aoa.findIndex((row) => {
      const cells = row.map((c) => normalizeHeader(c))
      return cells.includes('name') && (cells.includes('number') || cells.includes('phone'))
    })

    const rowsFromAoa =
      headerRowIdx >= 0
        ? (() => {
            const headerRow = aoa[headerRowIdx] ?? []
            const colKeys = headerRow.map((c) => normalizeHeader(c))
            const colIndex = (key: string) => colKeys.findIndex((k) => k === normalizeHeader(key))
            const idxName = colIndex('name')
            const idxNumber = colIndex('number')
            const idxLocation = colIndex('location')
            const idxRider = colIndex('rider assigned')
            const idxAmt = colIndex('amount to be collected')
            const idxCash = colIndex('ac cash collected')
            const idxMomo = colIndex('ac momo')
            const idxPaystack = colIndex('ac paystack')
            const idxRemarks = colIndex('remarks')

            return aoa
              .slice(headerRowIdx + 1)
              .map((r) => {
                const customer = String(r[idxName] ?? '').trim()
                if (!customer) return null
                const phone = String(r[idxNumber] ?? '').trim()
                const location = String(r[idxLocation] ?? '').trim()
                const riderAssigned = String(r[idxRider] ?? '').trim()
                const amountToBeCollectedGhs = parseMoney(r[idxAmt])
                const acCashCollectedGhs = parseMoney(r[idxCash])
                const acMomoGhs = parseMoney(r[idxMomo])
                const acPaystackGhs = parseMoney(r[idxPaystack])
                const remarks = String(r[idxRemarks] ?? '').trim()

                return {
                  customer,
                  phone: phone || undefined,
                  email: undefined,
                  location: location || undefined,
                  source: undefined,
                  joinDate: undefined,
                  segment: undefined,
                  riderAssigned: riderAssigned || undefined,
                  amountToBeCollectedGhs,
                  acCashCollectedGhs,
                  acMomoGhs,
                  acPaystackGhs,
                  remarks: remarks || undefined,
                } as ImportRow
              })
              .filter((x): x is ImportRow => Boolean(x))
          })()
        : []

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    const rowsFromJson = Array.isArray(json)
      ? json
          .map((r) => buildImportRowFromWideObject(r))
          .filter((x): x is ImportRow => Boolean(x))
      : []

    rows = rowsFromAoa.length > 0 ? rowsFromAoa : rowsFromJson
    if (rowsFromAoa.length > 0 && headerRowIdx >= 0) {
      const slice = aoa.slice(headerRowIdx + 1)
      parseStats = {
        dataRowsInRange: slice.length,
        rowsImported: rows.length,
        droppedEmptyCustomer: slice.length - rows.length,
      }
    } else if (Array.isArray(json)) {
      parseStats = {
        dataRowsInRange: json.length,
        rowsImported: rowsFromJson.length,
        droppedEmptyCustomer: json.length - rowsFromJson.length,
      }
    }
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No valid customer rows found (need Customer name in the header row).' }
  }

  const dataRowsInRange = parseStats.dataRowsInRange || rows.length
  return {
    ok: true,
    rows,
    replaceIntelFields,
    stats: {
      dataRowsInRange,
      rowsImported: rows.length,
      droppedEmptyCustomer: Math.max(0, dataRowsInRange - rows.length),
    },
  }
}
