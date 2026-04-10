'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Download,
  Loader2,
  Megaphone,
  Pencil,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
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
} from '@/components/ui/dialog'
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
import {
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNEL_ORDER,
  type MarketingChannelKey,
} from '@/lib/dtc-marketing-channels'
import { formatGhs } from '@/lib/dtc-orders'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Row = {
  key: MarketingChannelKey
  label: string
  spend: number
  attributed: number
  roas: number | null
}

type Snapshot = {
  periodDays: number
  rows: Row[]
  totalSpend: number
  totalAttributed: number
  blendedRoas: number | null
}

type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'

type Campaign = {
  id: string
  name: string
  channelKey: MarketingChannelKey
  spendGhs: number
  status: CampaignStatus
  startDate: string
  endDate: string
}

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
]

function chartData(rows: Row[]) {
  return rows.map((r) => ({
    channel: r.label,
    spend: r.spend,
    attributed: r.attributed,
  }))
}

function axisMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
  return String(Math.round(v))
}

function roasCell(roas: number | null, spend: number, attributed: number) {
  if (spend > 0 && roas !== null) {
    return <span className="font-medium tabular-nums">{roas.toFixed(2)}x</span>
  }
  if (spend === 0 && attributed > 0) {
    return <span className="text-muted-foreground">—</span>
  }
  if (spend === 0 && attributed === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return <span className="font-medium tabular-nums">0.00x</span>
}

function dateInputToIso(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date(dateStr).toISOString()
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function isoToDateInput(iso: string) {
  const x = new Date(iso)
  const y = x.getFullYear()
  const mo = String(x.getMonth() + 1).padStart(2, '0')
  const da = String(x.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function statusBadge(status: CampaignStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
    case 'paused':
      return <Badge variant="secondary">Paused</Badge>
    case 'completed':
      return <Badge variant="outline">Completed</Badge>
    default:
      return <Badge variant="outline">Draft</Badge>
  }
}

function defaultForm(): {
  name: string
  channelKey: MarketingChannelKey
  spendGhs: string
  status: CampaignStatus
  startDate: string
  endDate: string
} {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    name: '',
    channelKey: 'meta',
    spendGhs: '',
    status: 'active',
    startDate: fmt(start),
    endDate: fmt(end),
  }
}

export function MarketingAttributionView() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [campaignsOpen, setCampaignsOpen] = useState(false)
  const [campaignView, setCampaignView] = useState<'list' | 'form'>('list')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/marketing-attribution', {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as Snapshot
      setSnapshot(data)
    } catch {
      toast.error('Could not load marketing attribution')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    try {
      const res = await fetch('/api/dtc/marketing-campaigns', {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = (await res.json()) as { campaigns: Campaign[] }
      setCampaigns(data.campaigns)
    } catch {
      toast.error('Could not load campaigns')
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (campaignsOpen) void loadCampaigns()
  }, [campaignsOpen, loadCampaigns])

  const chartRows = useMemo(
    () => (snapshot ? chartData(snapshot.rows) : []),
    [snapshot],
  )

  const maxVal = useMemo(() => {
    let m = 0
    for (const r of chartRows) {
      m = Math.max(m, r.spend, r.attributed)
    }
    return m > 0 ? m : 1
  }, [chartRows])

  function openCampaigns() {
    setCampaignView('list')
    setEditingId(null)
    setForm(defaultForm())
    setCampaignsOpen(true)
  }

  function startCreate() {
    setEditingId(null)
    setForm(defaultForm())
    setCampaignView('form')
  }

  function startEdit(c: Campaign) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      channelKey: c.channelKey,
      spendGhs: String(c.spendGhs),
      status: c.status,
      startDate: isoToDateInput(c.startDate),
      endDate: isoToDateInput(c.endDate),
    })
    setCampaignView('form')
  }

  async function submitCampaign(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      toast.error('Enter a campaign name')
      return
    }
    const spend = Number(form.spendGhs)
    if (!Number.isFinite(spend) || spend < 0) {
      toast.error('Enter a valid spend amount')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name,
        channelKey: form.channelKey,
        spendGhs: spend,
        status: form.status,
        startDate: dateInputToIso(form.startDate),
        endDate: dateInputToIso(form.endDate),
      }
      const res = await fetch(
        editingId
          ? `/api/dtc/marketing-campaigns/${editingId}`
          : '/api/dtc/marketing-campaigns',
        {
          method: editingId ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Save failed')
      }
      toast.success(editingId ? 'Campaign updated' : 'Campaign created')
      setCampaignView('list')
      setEditingId(null)
      await loadCampaigns()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save campaign')
    } finally {
      setSaving(false)
    }
  }

  async function removeCampaign(id: string) {
    if (!window.confirm('Delete this campaign?')) return
    try {
      const res = await fetch(`/api/dtc/marketing-campaigns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Campaign deleted')
      await loadCampaigns()
      await load()
    } catch {
      toast.error('Could not delete campaign')
    }
  }

  function handleExport() {
    if (!snapshot?.rows.length) {
      toast.message('Nothing to export')
      return
    }
    const header = ['channel', 'spend', 'attributed', 'roas']
    const lines = [
      header.join(','),
      ...snapshot.rows.map((r) =>
        [
          `"${r.label.replace(/"/g, '""')}"`,
          r.spend,
          r.attributed,
          r.roas ?? '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-marketing-attribution-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Marketing Attribution"
        description="Campaign spend is prorated into the last 30 days by calendar overlap. Order revenue maps to channels: Instagram→Meta, Web→Google, TikTok→TikTok, B2B portal→B2B, Other→Other. Draft campaigns do not count toward spend."
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExport}
                disabled={loading || !snapshot}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                type="button"
                onClick={openCampaigns}
              >
                <Megaphone className="h-4 w-4" />
                Campaigns
              </Button>
            </div>
            <Dialog
              open={campaignsOpen}
              onOpenChange={(o) => {
                setCampaignsOpen(o)
                if (!o) {
                  setCampaignView('list')
                  setEditingId(null)
                }
              }}
            >
              <DialogContent className="flex max-h-[min(90vh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                {campaignView === 'list' ? (
                  <>
                    <DialogHeader className="border-b border-border px-6 py-4">
                      <DialogTitle>Campaigns</DialogTitle>
                      <DialogDescription>
                        Add campaigns with name, channel, total budget, status, and flight dates.
                        Spend is allocated to the attribution window by day overlap.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-3">
                      <Button size="sm" onClick={startCreate}>
                        Add campaign
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-4">
                      {campaignsLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : campaigns.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          No campaigns yet. Create one to record ad spend.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Campaign</TableHead>
                              <TableHead className="hidden sm:table-cell">Channel</TableHead>
                              <TableHead className="text-right">Spend</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden md:table-cell">Dates</TableHead>
                              <TableHead className="w-[88px] text-right" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {campaigns.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="max-w-[140px] font-medium">
                                  <span className="line-clamp-2">{c.name}</span>
                                </TableCell>
                                <TableCell className="hidden text-muted-foreground sm:table-cell">
                                  {MARKETING_CHANNEL_LABELS[c.channelKey]}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {formatGhs(c.spendGhs)}
                                </TableCell>
                                <TableCell>{statusBadge(c.status)}</TableCell>
                                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                                  {format(new Date(c.startDate), 'd MMM yyyy')} –{' '}
                                  {format(new Date(c.endDate), 'd MMM yyyy')}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-0.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => startEdit(c)}
                                      aria-label={`Edit ${c.name}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => void removeCampaign(c.id)}
                                      aria-label={`Delete ${c.name}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </>
                ) : (
                  <form
                    className="flex max-h-[min(90vh,44rem)] flex-col overflow-hidden"
                    onSubmit={submitCampaign}
                  >
                    <DialogHeader className="border-b border-border px-6 py-4">
                      <DialogTitle>
                        {editingId ? 'Edit campaign' : 'New campaign'}
                      </DialogTitle>
                      <DialogDescription>
                        Total budget is spread across the campaign dates; the slice overlapping the
                        last 30 days feeds channel spend.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="camp-name">Campaign name</Label>
                        <Input
                          id="camp-name"
                          value={form.name}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, name: e.target.value }))
                          }
                          placeholder="Spring launch — Meta"
                          autoComplete="off"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Channel</Label>
                          <Select
                            value={form.channelKey}
                            onValueChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                channelKey: v as MarketingChannelKey,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MARKETING_CHANNEL_ORDER.map((k) => (
                                <SelectItem key={k} value={k}>
                                  {MARKETING_CHANNEL_LABELS[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={form.status}
                            onValueChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                status: v as CampaignStatus,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="camp-spend">Total spend (GHS)</Label>
                        <Input
                          id="camp-spend"
                          inputMode="decimal"
                          value={form.spendGhs}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, spendGhs: e.target.value }))
                          }
                          placeholder="4200"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="camp-start">Start date</Label>
                          <Input
                            id="camp-start"
                            type="date"
                            value={form.startDate}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, startDate: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="camp-end">End date</Label>
                          <Input
                            id="camp-end"
                            type="date"
                            value={form.endDate}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, endDate: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="border-t border-border px-6 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setCampaignView('list')
                          setEditingId(null)
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : editingId ? (
                          'Save changes'
                        ) : (
                          'Create campaign'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Blended ROAS</p>
            {loading ? (
              <div className="mt-6 flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {snapshot?.blendedRoas != null
                    ? `${(Math.round(snapshot.blendedRoas * 100) / 100).toFixed(2)}x`
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last {snapshot?.periodDays ?? 30} days · DTC orders · prorated campaign spend vs
                  attributed revenue
                </p>
                {snapshot && snapshot.totalSpend === 0 ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
                    Add active/completed campaigns to compute ROAS.
                  </p>
                ) : null}
              </>
            )}
          </Card>
          <Card className="p-5 lg:col-span-2">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Spend vs attributed revenue
            </p>
            {loading ? (
              <div className="flex h-52 items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : chartRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="channel"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={56}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        domain={[0, maxVal * 1.1]}
                        tickFormatter={(v) => axisMoney(Number(v))}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatGhs(value),
                          name === 'spend' ? 'Spend' : 'Attributed revenue',
                        ]}
                        labelFormatter={(label) => String(label)}
                        contentStyle={{
                          backgroundColor: 'var(--color-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="spend" name="spend" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar
                        dataKey="attributed"
                        name="attributed"
                        fill="#ea580c"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-indigo-600" />
                    Spend
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-orange-600" />
                    Attributed revenue
                  </span>
                </div>
              </>
            )}
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Channel summary</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Attributed</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot?.rows.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGhs(c.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatGhs(c.attributed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {roasCell(c.roas, c.spend, c.attributed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  )
}
