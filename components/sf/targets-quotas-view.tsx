'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  Footprints,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  Target,
  Users,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { formatGhs } from '@/lib/dtc-orders'
import { cn } from '@/lib/utils'

const QUICK_LINKS = [
  { href: '/sf/posm-tracker', label: 'POSM tracker', icon: Package },
  { href: '/sf/shop-visits', label: 'Shop visits', icon: Footprints },
  { href: '/sf/outlet-scouting', label: 'Outlet scouting', icon: Store },
] as const

type TargetRow = {
  id: string
  month: string
  repName: string
  region?: string
  targetVisits: number
  targetSellInGhs: number
  targetPosmTasks: number
  notes?: string
  createdAt: string
  updatedAt: string
  actualVisitsMtd: number
  actualSellInMtdGhs: number
  newShopsAcquiredMtd: number
  actualPosmDoneMtd: number
  visitsAttainmentPct: number | null
  sellInAttainmentPct: number | null
  posmAttainmentPct: number | null
}

function monthKeyForDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatPct(pct: number | null): string {
  if (pct == null) return '—'
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`
}

function attainmentTone(pct: number | null): 'emerald' | 'amber' | 'red' | 'muted' {
  if (pct == null) return 'muted'
  if (pct >= 100) return 'emerald'
  if (pct >= 75) return 'amber'
  return 'red'
}

function attainmentBadge(pct: number | null) {
  if (pct == null) return <Badge variant="outline">—</Badge>
  const tone = attainmentTone(pct)
  const label = formatPct(pct)
  if (tone === 'emerald') {
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
        {label}
      </Badge>
    )
  }
  if (tone === 'amber') {
    return <Badge variant="secondary">{label}</Badge>
  }
  return <Badge variant="destructive">{label}</Badge>
}

function AttainmentBar({ pct }: { pct: number | null }) {
  const tone = attainmentTone(pct)
  const width = pct == null ? 0 : Math.min(100, Math.max(4, pct))
  return (
    <Progress
      value={width}
      className={cn(
        'h-1.5',
        tone === 'emerald' && '[&>div]:bg-emerald-500',
        tone === 'amber' && '[&>div]:bg-amber-500',
        tone === 'red' && '[&>div]:bg-red-500',
        tone === 'muted' && '[&>div]:bg-muted-foreground/30',
      )}
    />
  )
}

function TqKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconWrapClass,
  iconClass,
}: {
  label: string
  value: React.ReactNode
  subtitle: React.ReactNode
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
}) {
  return (
    <Card className="dashboard-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn('shrink-0 rounded-2xl p-3', iconWrapClass)}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
      </div>
    </Card>
  )
}

export function TargetsQuotasView() {
  const [month, setMonth] = useState(() => monthKeyForDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<TargetRow[]>([])
  const [mtd, setMtd] = useState<{
    completedVisits: number
    sellInGhs: number
    shopsWon: number
    posmTasksDone: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    repName: '',
    region: '',
    targetVisits: '',
    targetSellInGhs: '',
    targetPosmTasks: '',
    notes: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    repName: '',
    region: '',
    targetVisits: '',
    targetSellInGhs: '',
    targetPosmTasks: '',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sf/targets?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as {
        month: string
        items: TargetRow[]
        mtd?: {
          completedVisits: number
          sellInGhs: number
          shopsWon: number
          posmTasksDone: number
        }
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setMtd(
        data.mtd
          ? {
              completedVisits: data.mtd.completedVisits,
              sellInGhs: data.mtd.sellInGhs,
              shopsWon: data.mtd.shopsWon,
              posmTasksDone: data.mtd.posmTasksDone ?? 0,
            }
          : null,
      )
    } catch {
      toast.error('Could not load targets & quotas')
      setItems([])
      setMtd(null)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const r of items) {
      if (r.region) set.add(r.region)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((r) => {
      if (regionFilter !== 'all' && (r.region ?? '') !== regionFilter) return false
      if (!q) return true
      return (
        r.repName.toLowerCase().includes(q) ||
        (r.region ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, query, regionFilter])

  const summary = useMemo(() => {
    let reps = 0
    let above100Visits = 0
    let above100SellIn = 0
    let above100Posm = 0
    let targetVisits = 0
    let targetSellIn = 0
    let targetPosm = 0
    let actualVisits = 0
    let actualSellIn = 0
    let actualPosm = 0
    let newShops = 0
    for (const r of items) {
      reps += 1
      targetVisits += r.targetVisits
      targetSellIn += r.targetSellInGhs
      targetPosm += r.targetPosmTasks ?? 0
      actualVisits += r.actualVisitsMtd
      actualSellIn += r.actualSellInMtdGhs
      actualPosm += r.actualPosmDoneMtd ?? 0
      newShops += r.newShopsAcquiredMtd ?? 0
      if ((r.visitsAttainmentPct ?? 0) >= 100) above100Visits += 1
      if ((r.sellInAttainmentPct ?? 0) >= 100) above100SellIn += 1
      if ((r.posmAttainmentPct ?? 0) >= 100) above100Posm += 1
    }

    // Cards should reflect the real Shop Visits / Outlet Scouting / POSM MTD totals (not only targeted reps).
    if (mtd) {
      actualVisits = mtd.completedVisits
      actualSellIn = mtd.sellInGhs
      newShops = mtd.shopsWon
      actualPosm = mtd.posmTasksDone
    }

    const visitsPct =
      targetVisits > 0 ? Math.min(999, Math.round((actualVisits / targetVisits) * 1000) / 10) : null
    const sellInPct =
      targetSellIn > 0
        ? Math.min(999, Math.round((actualSellIn / targetSellIn) * 1000) / 10)
        : null
    const posmPct =
      targetPosm > 0 ? Math.min(999, Math.round((actualPosm / targetPosm) * 1000) / 10) : null
    return {
      reps,
      above100Visits,
      above100SellIn,
      above100Posm,
      targetVisits,
      targetSellIn,
      targetPosm,
      actualVisits,
      actualSellIn,
      actualPosm,
      newShops,
      visitsPct,
      sellInPct,
      posmPct,
    }
  }, [items, mtd])

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const repName = createForm.repName.trim()
    if (!repName) {
      toast.error('Rep name is required')
      return
    }
    const targetVisits = Number(createForm.targetVisits)
    const targetSellInGhs = Number(createForm.targetSellInGhs)
    const targetPosmTasksRaw = createForm.targetPosmTasks.trim()
    const targetPosmTasks =
      targetPosmTasksRaw === '' ? 0 : Number(targetPosmTasksRaw)
    if (
      !Number.isFinite(targetVisits) ||
      !Number.isInteger(targetVisits) ||
      targetVisits < 0 ||
      !Number.isFinite(targetSellInGhs) ||
      targetSellInGhs < 0 ||
      !Number.isFinite(targetPosmTasks) ||
      !Number.isInteger(targetPosmTasks) ||
      targetPosmTasks < 0
    ) {
      toast.error('Enter valid targets')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/sf/targets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          repName,
          region: createForm.region.trim() || undefined,
          targetVisits,
          targetSellInGhs,
          targetPosmTasks,
          notes: createForm.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (res.status === 409) {
        toast.error('That rep already has a target for this month')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Target created')
      setCreateOpen(false)
      setCreateForm({
        repName: '',
        region: '',
        targetVisits: '',
        targetSellInGhs: '',
        targetPosmTasks: '',
        notes: '',
      })
      void load()
    } catch {
      toast.error('Could not create target')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(row: TargetRow) {
    setEditId(row.id)
    setEditForm({
      repName: row.repName,
      region: row.region ?? '',
      targetVisits: String(row.targetVisits),
      targetSellInGhs: String(row.targetSellInGhs),
      targetPosmTasks: String(row.targetPosmTasks ?? 0),
      notes: row.notes ?? '',
    })
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const repName = editForm.repName.trim()
    if (!repName) {
      toast.error('Rep name is required')
      return
    }
    const targetVisits = Number(editForm.targetVisits)
    const targetSellInGhs = Number(editForm.targetSellInGhs)
    const targetPosmTasksRaw = editForm.targetPosmTasks.trim()
    const targetPosmTasks =
      targetPosmTasksRaw === '' ? 0 : Number(targetPosmTasksRaw)
    if (
      !Number.isFinite(targetVisits) ||
      !Number.isInteger(targetVisits) ||
      targetVisits < 0 ||
      !Number.isFinite(targetSellInGhs) ||
      targetSellInGhs < 0 ||
      !Number.isFinite(targetPosmTasks) ||
      !Number.isInteger(targetPosmTasks) ||
      targetPosmTasks < 0
    ) {
      toast.error('Enter valid targets')
      return
    }

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/targets/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repName,
          region: editForm.region.trim() ? editForm.region.trim() : null,
          targetVisits,
          targetSellInGhs,
          targetPosmTasks,
          notes: editForm.notes.trim() ? editForm.notes.trim() : null,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Target updated')
      setEditOpen(false)
      setEditId(null)
      void load()
    } catch {
      toast.error('Could not update target')
    } finally {
      setEditing(false)
    }
  }

  const monthLabel = useMemo(() => {
    const dt = new Date(`${month}-01T12:00:00.000Z`)
    return format(dt, 'MMMM yyyy')
  }, [month])

  const hasActiveFilters = query.trim().length > 0 || regionFilter !== 'all'

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Targets & Quotas"
        description="Set monthly rep quotas and track MTD attainment from completed shop visits, sell-in on visits, and POSM tasks completed in the month (assign reps on the POSM Tracker for accurate roll-up)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/sf/posm-tracker">POSM Tracker</Link>
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add target
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add rep target</DialogTitle>
                    <DialogDescription>
                      Creates one target row per rep for this month ({month}). Visit and sell-in
                      actuals roll up from completed visits; POSM counts tasks marked done this
                      month.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="tq-rep">Rep name</Label>
                      <Input
                        id="tq-rep"
                        value={createForm.repName}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, repName: e.target.value }))
                        }
                        placeholder="Ama K."
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tq-region">Region (optional)</Label>
                      <Input
                        id="tq-region"
                        value={createForm.region}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, region: e.target.value }))
                        }
                        placeholder="Greater Accra"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="tq-visits">Target visits</Label>
                        <Input
                          id="tq-visits"
                          inputMode="numeric"
                          value={createForm.targetVisits}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, targetVisits: e.target.value }))
                          }
                          placeholder="80"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tq-sellin">Target sell-in (GHS)</Label>
                        <Input
                          id="tq-sellin"
                          inputMode="decimal"
                          value={createForm.targetSellInGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, targetSellInGhs: e.target.value }))
                          }
                          placeholder="80000"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                        <Label htmlFor="tq-posm">Target POSM tasks</Label>
                        <Input
                          id="tq-posm"
                          inputMode="numeric"
                          value={createForm.targetPosmTasks}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, targetPosmTasks: e.target.value }))
                          }
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional; leave blank or 0 if not tracking POSM for this rep.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tq-notes">Notes (optional)</Label>
                      <Textarea
                        id="tq-notes"
                        value={createForm.notes}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        placeholder="Key accounts, territory context, constraints…"
                        rows={3}
                        className="resize-y"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving
                        </>
                      ) : (
                        'Save target'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Button key={link.href} variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={link.href}>
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              </Button>
            )
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TqKpiCard
            label="Reps targeted"
            value={loading ? '—' : summary.reps}
            subtitle={`Quotas set for ${monthLabel}`}
            icon={Users}
            iconWrapClass="bg-primary/10"
            iconClass="text-primary"
          />
          <TqKpiCard
            label="Visits (MTD)"
            value={loading ? '—' : `${summary.actualVisits.toLocaleString()} / ${summary.targetVisits.toLocaleString()}`}
            subtitle={
              loading
                ? 'Completed shop visits vs quota'
                : `Attainment ${formatPct(summary.visitsPct)}`
            }
            icon={Footprints}
            iconWrapClass="bg-indigo-500/10"
            iconClass="text-indigo-600 dark:text-indigo-400"
          />
          <TqKpiCard
            label="Sell-in (MTD)"
            value={
              loading
                ? '—'
                : `${formatGhs(summary.actualSellIn)} / ${formatGhs(summary.targetSellIn)}`
            }
            subtitle={
              loading ? 'Sell-in on completed visits' : `Attainment ${formatPct(summary.sellInPct)}`
            }
            icon={Wallet}
            iconWrapClass="bg-emerald-500/10"
            iconClass="text-emerald-600 dark:text-emerald-400"
          />
          <TqKpiCard
            label="New shops won"
            value={loading ? '—' : summary.newShops.toLocaleString()}
            subtitle="Outlet scouting · status won"
            icon={Store}
            iconWrapClass="bg-sky-500/10"
            iconClass="text-sky-600 dark:text-sky-400"
          />
        </div>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">MTD attainment snapshot</p>
              <p className="text-xs text-muted-foreground">
                Team roll-up for {monthLabel} · actuals from shop visits, sell-in, and POSM tasks
                marked done
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase text-muted-foreground">Above 100%</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {loading
                  ? '—'
                  : `${summary.above100Visits}V · ${summary.above100SellIn}S · ${summary.above100Posm}P`}
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                key: 'visits',
                label: 'Visits',
                pct: summary.visitsPct,
                detail: loading
                  ? '—'
                  : `${summary.actualVisits.toLocaleString()} / ${summary.targetVisits.toLocaleString()}`,
              },
              {
                key: 'sellin',
                label: 'Sell-in',
                pct: summary.sellInPct,
                detail: loading
                  ? '—'
                  : `${formatGhs(summary.actualSellIn)} / ${formatGhs(summary.targetSellIn)}`,
              },
              {
                key: 'posm',
                label: 'POSM tasks',
                pct: summary.posmPct,
                detail: loading
                  ? '—'
                  : `${summary.actualPosm.toLocaleString()} / ${summary.targetPosm.toLocaleString()}`,
              },
            ].map((row) => (
              <div key={row.key} className="rounded-xl border border-border/60 bg-muted/15 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </p>
                  {attainmentBadge(row.pct)}
                </div>
                <AttainmentBar pct={row.pct} />
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">{row.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Filter quotas</h2>
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('')
                  setRegionFilter('all')
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <div className="space-y-2">
              <Label htmlFor="tq-search" className="text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="tq-search"
                  placeholder="Rep, region, notes…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Month</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Region
              </Label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!loading ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {filtered.length} of {items.length} rep{items.length === 1 ? '' : 's'} for{' '}
              {monthLabel}
            </p>
          ) : null}
        </Card>

        <Card className="dashboard-card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Rep quotas</h2>
              <p className="text-xs text-muted-foreground">
                Visits, sell-in, and POSM attainment per rep
              </p>
            </div>
            {!loading && items.length > 0 ? (
              <Badge variant="outline" className="tabular-nums">
                {filtered.length} rows
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading targets…</span>
            </div>
          ) : items.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No targets for {monthLabel}</EmptyTitle>
                <EmptyDescription>
                  Add rep targets to track quota attainment for visits, sell-in, and POSM tasks.
                  Assign reps on the POSM Tracker for accurate roll-up.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  No rows match your filters. Try another search or region.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead className="hidden md:table-cell">Region</TableHead>
                    <TableHead>Visits</TableHead>
                    <TableHead>Sell-in</TableHead>
                    <TableHead className="hidden xl:table-cell">POSM</TableHead>
                    <TableHead className="hidden lg:table-cell">Notes</TableHead>
                    <TableHead className="w-[52px] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="align-top">
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{r.repName}</p>
                          <p className="text-xs text-muted-foreground md:hidden">
                            {r.region ?? 'No region'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {r.region ?? '—'}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span>
                              {r.actualVisitsMtd} / {r.targetVisits}
                            </span>
                            {attainmentBadge(r.visitsAttainmentPct)}
                          </div>
                          <AttainmentBar pct={r.visitsAttainmentPct} />
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span className="truncate">
                              {formatGhs(r.actualSellInMtdGhs)} / {formatGhs(r.targetSellInGhs)}
                            </span>
                            {attainmentBadge(r.sellInAttainmentPct)}
                          </div>
                          <AttainmentBar pct={r.sellInAttainmentPct} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden min-w-[120px] xl:table-cell">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span>
                              {r.actualPosmDoneMtd ?? 0} / {r.targetPosmTasks ?? 0}
                            </span>
                            {attainmentBadge(r.posmAttainmentPct)}
                          </div>
                          <AttainmentBar pct={r.posmAttainmentPct} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[280px] truncate text-sm text-muted-foreground lg:table-cell">
                        {r.notes ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(r)}
                          aria-label={`Edit ${r.repName}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit target</DialogTitle>
              <DialogDescription>
                Update the rep name, region, or monthly quotas (visits, sell-in, POSM). Month cannot
                be changed; create a new row for another month.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rep">Rep name</Label>
                <Input
                  id="edit-rep"
                  value={editForm.repName}
                  onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-region">Region</Label>
                <Input
                  id="edit-region"
                  value={editForm.region}
                  onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Leave blank to clear"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-visits">Target visits</Label>
                  <Input
                    id="edit-visits"
                    inputMode="numeric"
                    value={editForm.targetVisits}
                    onChange={(e) => setEditForm((f) => ({ ...f, targetVisits: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sellin">Target sell-in (GHS)</Label>
                  <Input
                    id="edit-sellin"
                    inputMode="decimal"
                    value={editForm.targetSellInGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, targetSellInGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="edit-posm">Target POSM tasks</Label>
                  <Input
                    id="edit-posm"
                    inputMode="numeric"
                    value={editForm.targetPosmTasks}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, targetPosmTasks: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="resize-y"
                  placeholder="Leave blank to clear"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editing || !editId}>
                {editing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

