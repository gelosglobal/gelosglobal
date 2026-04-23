import { enUS } from 'date-fns/locale'
import { isValid, parse } from 'date-fns'
import * as XLSX from 'xlsx'

const SHORT_MONTH: Record<string, string> = {
  jan: 'Jan',
  feb: 'Feb',
  mar: 'Mar',
  apr: 'Apr',
  may: 'May',
  jun: 'Jun',
  jul: 'Jul',
  aug: 'Aug',
  sep: 'Sep',
  sept: 'Sep',
  oct: 'Oct',
  nov: 'Nov',
  dec: 'Dec',
}

/**
 * Only normalize **short** month tokens (FEB, Sept, jan) for `MMM` parses.
 * Do not touch full names (January) — the old `[a-z]*` pattern turned "January" → "Jan" and broke `MMMM`.
 */
function normalizeMonthTokens(s: string): string {
  return s.replace(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept?|oct|nov|dec)\b(?![a-z])/gi,
    (full) => {
      const lower = full.toLowerCase()
      const key = lower.startsWith('sept') ? 'sept' : lower.slice(0, 3)
      return SHORT_MONTH[key] ?? full
    },
  )
}

/** "29th May May2025" → "29th May 2025" (duplicate month before year, no space before year) */
function collapseDuplicateMonthBeforeYear(s: string): string {
  const long =
    'january|february|march|april|may|june|july|august|september|october|november|december'
  return s.replace(
    new RegExp(`\\b(${long})\\s+(${long})(\\d{4})\\b`, 'gi'),
    (full, m1: string, m2: string, y: string) =>
      m1.toLowerCase() === m2.toLowerCase() ? `${m1} ${y}` : full,
  )
}

/** "Sunday Monday" style duplicate full month only when both are whole words */
function collapseDuplicateMonthWords(s: string): string {
  return s.replace(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\1\b/gi,
    '$1',
  )
}

/** "08th" → "8th" so `do` / `d` date-fns tokens match */
function stripLeadingZeroOnOrdinalDay(s: string): string {
  return s.replace(/\b0+(\d{1,2})(st|nd|rd|th)\b/gi, (_, d: string, ord: string) => `${Number(d)}${ord.toLowerCase()}`)
}

/** Helps date-fns parse mixed-case sheet strings like "14th january, 2026". */
function titleCaseEnglishMonths(s: string): string {
  const months =
    'january|february|march|april|may|june|july|august|september|october|november|december'
  return s.replace(new RegExp(`\\b(${months})\\b`, 'gi'), (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/**
 * Parses Excel cell values for “First / Last order date” columns:
 * Excel serials, ISO dates, and common Ghana sheet strings like `3rd March 2025`, `21TH FEB`, `24th November2025`.
 */
export function parseOrderDateCell(v: unknown, defaultYear = 2025): string | undefined {
  if (v == null || v === '') return undefined
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
  if (typeof v === 'number' && Number.isFinite(v)) {
    const p = XLSX.SSF.parse_date_code(v)
    if (p && p.y > 1900) {
      const d = new Date(p.y, p.m - 1, p.d, p.H ?? 0, p.M ?? 0, Math.floor(p.S ?? 0))
      return d.toISOString()
    }
  }

  let s = String(v).trim()
  if (!s) return undefined

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  // "November2025" → "November 2025" (and similar month+year)
  s = s.replace(/([a-z]{3,})(\d{4})\b/gi, '$1 $2')
  // "21TH" / "2ND" → "21st" / "2nd" so date-fns `do` and strict ordinals work
  s = s.replace(/(\d+)(ST|ND|RD|TH)\b/gi, (_, d: string, suf: string) => {
    const n = Math.min(31, Math.max(1, Math.floor(Number(d))))
    const t = n % 10
    const t100 = n % 100
    let ord: string
    if (t === 1 && t100 !== 11) ord = 'st'
    else if (t === 2 && t100 !== 12) ord = 'nd'
    else if (t === 3 && t100 !== 13) ord = 'rd'
    else ord = 'th'
    return `${n}${ord}`
  })
  s = s.replace(/\s+/g, ' ').trim()
  s = collapseDuplicateMonthBeforeYear(s)
  s = collapseDuplicateMonthWords(s)
  s = stripLeadingZeroOnOrdinalDay(s)
  s = titleCaseEnglishMonths(s)
  s = normalizeMonthTokens(s)

  const refMid = new Date(defaultYear, 5, 15)
  const withYear = [
    'do MMMM yyyy',
    'do MMMM, yyyy',
    'd MMMM yyyy',
    'd MMMM, yyyy',
    'd MMM yyyy',
    'd MMM, yyyy',
    'dd MMM yyyy',
    'dd MMM, yyyy',
    'MMMM d, yyyy',
    'MMMM do, yyyy',
    'MMMM d yyyy',
    'do MMM yyyy',
    'do MMM, yyyy',
    'd MMM yyyy',
    'd MMM, yyyy',
    'dd-MMM-yy',
    'd-MMM-yy',
    'dd-MMM-yyyy',
    'd-MMM-yyyy',
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd-MM-yyyy',
    'd-MM-yyyy',
    'M/d/yyyy',
    'MM/dd/yyyy',
    'M/d/yy',
    'MM/dd/yy',
    'yyyy/MM/dd',
  ]
  const loc = { locale: enUS }
  for (const fmt of withYear) {
    const d = parse(s, fmt, refMid, loc)
    if (isValid(d)) return d.toISOString()
  }

  const refStart = new Date(defaultYear, 0, 1)
  const noYear = ['do MMMM', 'do MMM', 'd MMMM', 'd MMM']
  for (const fmt of noYear) {
    const d = parse(s, fmt, refStart, loc)
    if (isValid(d)) return new Date(defaultYear, d.getMonth(), d.getDate()).toISOString()
  }

  // "21st February 2025" / odd spacing: remove ordinals and try plain d MMM(M) yyyy
  const deord = s.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ').trim()
  for (const fmt of ['d MMMM yyyy', 'd MMM yyyy', 'dd MMMM yyyy', 'dd MMM yyyy', 'd MMM yy', 'M/d/yyyy', 'M/d/yy']) {
    const d = parse(deord, fmt, refMid, loc)
    if (isValid(d)) return d.toISOString()
  }

  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? undefined : fallback.toISOString()
}
