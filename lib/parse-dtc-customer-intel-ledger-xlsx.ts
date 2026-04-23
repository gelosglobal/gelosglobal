import { parseOrderDateCell } from '@/lib/dtc-customer-sheet-dates'
import * as XLSX from 'xlsx'

export type DtcLedgerImportRow = {
  orderedAt?: Date
  orderNumber?: string
  customerName: string
  phoneNumber?: string
  location?: string
  riderAssigned?: string
  amountToCollectGhs?: number
  cashCollectedGhs?: number
  momoCollectedGhs?: number
  paystackCollectedGhs?: number
  totalCollectedGhs?: number
  paymentMethod?: string
  deliveryStatus?: string
  remarks?: string
  additionalRemarks?: string
}

type ParseOk = {
  ok: true
  rows: DtcLedgerImportRow[]
  stats: { dataRowsInRange: number; rowsImported: number; droppedEmptyCustomer: number }
}
type ParseErr = { ok: false; error: string }

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
  nk.startsWith(`${want} (`) ||
  nk.includes(` ${want} `)

const parseMoney = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').trim()
  if (!s) return undefined
  const n = Number(s.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export function parseDtcCustomerIntelLedgerXlsxBuffer(
  buf: ArrayBuffer,
  sheetYear: number = new Date().getFullYear(),
): ParseOk | ParseErr {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true, cellText: true })
  } catch {
    return { ok: false, error: 'Could not read this file as Excel (.xlsx).' }
  }

  const sheet = wb.Sheets['Customers'] ?? wb.Sheets[wb.SheetNames[0] ?? '']
  if (!sheet) return { ok: false, error: 'No sheets found in this file.' }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  if (!Array.isArray(aoa) || aoa.length === 0) {
    return { ok: false, error: 'No rows found in this sheet.' }
  }

  const headerIdx = aoa.findIndex((row) => {
    const cells = (row ?? []).map((c) => normalizeHeader(c)).filter(Boolean)
    const hasDate = cells.some((c) => c === 'date' || c.includes('date'))
    const hasOrder = cells.some((c) => c === 'order' || c.includes('order'))
    const hasCustomer = cells.some(
      (c) => c === 'customer name' || (c.includes('customer') && c.includes('name')),
    )
    const hasPhone = cells.some(
      (c) => c === 'phone number' || (c.includes('phone') && c.includes('number')),
    )
    return hasDate && hasOrder && hasCustomer && hasPhone
  })

  if (headerIdx < 0) {
    return {
      ok: false,
      error: 'Could not find the ledger header row (need Date, Order #, Customer Name, Phone Number).',
    }
  }

  const header = aoa[headerIdx] ?? []
  const keys = header.map((c) => normalizeHeader(c))
  const find = (...aliases: string[]) => {
    const wants = aliases.map((a) => normalizeHeader(a)).filter(Boolean)
    return keys.findIndex((k) => wants.some((w) => headerKeyMatches(k, w)))
  }

  const idxDate = find('date')
  const idxOrderNo = find('order #', 'order number', 'order no', 'order')
  const idxCustomer = find('customer name', 'customer')
  const idxPhone = find('phone number', 'phone')
  const idxLocation = find('location')
  const idxRider = find('rider assigned', 'rider')
  const idxAmt = find('amount to collect', 'amount to collect (ghc)', 'amount to collect (ghs)')
  const idxCash = find('cash collected', 'cash collected (ghc)', 'cash collected (ghs)')
  const idxMomo = find('momo collected', 'momo collected (ghc)', 'momo collected (ghs)', 'momo')
  const idxPaystack = find(
    'paystack collected',
    'paystack collected (ghc)',
    'paystack collected (ghs)',
    'paystack',
  )
  const idxTotalCollected = find('total collected', 'total collected (ghc)', 'total collected (ghs)')
  const idxPaymentMethod = find('payment method', 'payment')
  const idxDeliveryStatus = find('delivery status', 'status')
  const idxRemarks = find('remarks', 'remark')
  const idxAdditional = find('additional remarks', 'additional remark')

  const rows: DtcLedgerImportRow[] = []
  let dataRows = 0
  let dropped = 0

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    dataRows++
    const customerName = String(r[idxCustomer] ?? '').trim()
    if (!customerName) {
      dropped++
      continue
    }

    const orderedAtIso =
      idxDate >= 0 ? (parseOrderDateCell(r[idxDate], sheetYear) ?? undefined) : undefined
    const orderedAt =
      orderedAtIso && !Number.isNaN(new Date(orderedAtIso).getTime()) ? new Date(orderedAtIso) : undefined
    const orderNumber = idxOrderNo >= 0 ? String(r[idxOrderNo] ?? '').trim() : ''
    const phoneNumber = idxPhone >= 0 ? String(r[idxPhone] ?? '').trim() : ''
    const location = idxLocation >= 0 ? String(r[idxLocation] ?? '').trim() : ''
    const riderAssigned = idxRider >= 0 ? String(r[idxRider] ?? '').trim() : ''

    const amountToCollectGhs = idxAmt >= 0 ? parseMoney(r[idxAmt]) : undefined
    const cashCollectedGhs = idxCash >= 0 ? parseMoney(r[idxCash]) : undefined
    const momoCollectedGhs = idxMomo >= 0 ? parseMoney(r[idxMomo]) : undefined
    const paystackCollectedGhs = idxPaystack >= 0 ? parseMoney(r[idxPaystack]) : undefined
    const totalCollectedGhs =
      idxTotalCollected >= 0
        ? parseMoney(r[idxTotalCollected])
        : (cashCollectedGhs ?? 0) + (momoCollectedGhs ?? 0) + (paystackCollectedGhs ?? 0)

    const paymentMethod = idxPaymentMethod >= 0 ? String(r[idxPaymentMethod] ?? '').trim() : ''
    const deliveryStatus = idxDeliveryStatus >= 0 ? String(r[idxDeliveryStatus] ?? '').trim() : ''
    const remarks = idxRemarks >= 0 ? String(r[idxRemarks] ?? '').trim() : ''
    const additionalRemarks = idxAdditional >= 0 ? String(r[idxAdditional] ?? '').trim() : ''

    rows.push({
      orderedAt,
      orderNumber: orderNumber || undefined,
      customerName,
      phoneNumber: phoneNumber || undefined,
      location: location || undefined,
      riderAssigned: riderAssigned || undefined,
      amountToCollectGhs,
      cashCollectedGhs,
      momoCollectedGhs,
      paystackCollectedGhs,
      totalCollectedGhs,
      paymentMethod: paymentMethod || undefined,
      deliveryStatus: deliveryStatus || undefined,
      remarks: remarks || undefined,
      additionalRemarks: additionalRemarks || undefined,
    })
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No valid ledger rows found (need Customer Name in the header row).' }
  }

  return {
    ok: true,
    rows,
    stats: {
      dataRowsInRange: dataRows,
      rowsImported: rows.length,
      droppedEmptyCustomer: Math.max(0, dataRows - rows.length),
    },
  }
}

