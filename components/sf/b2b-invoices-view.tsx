'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Download, FileText, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { formatGhs } from '@/lib/dtc-orders'

type InvoiceReceiptRow = {
  id: string
  outletName: string
  invoiceNumber: string
  invoiceAt: string | null
  amountGhs: number
  discountGhs: number
  taxGhs: number
  totalGhs: number
  billFrom: string | null
  dueAt: string | null
  createdAt: string
}

export function B2bInvoicesView() {
  const [saving, setSaving] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [history, setHistory] = useState<InvoiceReceiptRow[]>([])
  const [outletsOpen, setOutletsOpen] = useState(false)
  const [outletsLoading, setOutletsLoading] = useState(true)
  const [outlets, setOutlets] = useState<
    Array<{ outletName: string; invoices: number; lastInvoiceAt: string | null }>
  >([])
  const [outletMode, setOutletMode] = useState<'select' | 'custom'>('select')
  const [items, setItems] = useState<
    Array<{
      description: string
      qty: string
      unitPriceGhs: string
    }>
  >([{ description: '', qty: '1', unitPriceGhs: '' }])
  const [form, setForm] = useState({
    outletName: '',
    invoiceNumber: '',
    invoiceDate: '',
    discountGhs: '',
    includeTax: false,
    taxGhs: '',
    billFrom: '',
    dueDate: '',
    message: '',
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOutletsLoading(true)
      try {
        const res = await fetch('/api/sf/b2b-payments/outlets', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load outlets')
        const json = (await res.json()) as {
          outlets: Array<{ outletName: string; invoices: number; lastInvoiceAt: string | null }>
        }
        if (cancelled) return
        setOutlets(
          (json.outlets ?? [])
            .filter((o) => typeof o.outletName === 'string' && o.outletName.trim().length > 0)
            .map((o) => ({
              outletName: o.outletName.trim(),
              invoices: Number(o.invoices) || 0,
              lastInvoiceAt: o.lastInvoiceAt ?? null,
            })),
        )
      } catch {
        if (!cancelled) toast.error('Could not load outlets')
      } finally {
        if (!cancelled) setOutletsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadHistory = useMemo(() => {
    return async () => {
      setHistoryLoading(true)
      try {
        const res = await fetch('/api/sf/invoice-receipts', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load history')
        const json = (await res.json()) as { receipts: InvoiceReceiptRow[] }
        setHistory(Array.isArray(json.receipts) ? json.receipts : [])
      } catch {
        toast.error('Could not load invoice history')
      } finally {
        setHistoryLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const outletLabel = useMemo(() => {
    if (!form.outletName.trim()) return 'Select outlet…'
    return form.outletName
  }, [form.outletName])

  const computed = useMemo(() => {
    const rows = items
      .map((it) => ({
        description: it.description.trim(),
        qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
        unitPrice: Math.max(0, Number(it.unitPriceGhs) || 0),
      }))
      .filter((r) => r.description.length > 0 && r.qty > 0)

    let subtotal = 0
    for (const r of rows) {
      subtotal += r.qty * r.unitPrice
    }
    const discount = Math.max(0, Math.min(subtotal, Number(form.discountGhs) || 0))
    const tax = form.includeTax ? Math.max(0, Number(form.taxGhs) || 0) : 0
    const total = Math.max(0, subtotal - discount + tax)

    return { rows, subtotal, discount, tax, total }
  }, [form.discountGhs, form.includeTax, form.taxGhs, items])

  const invoiceDocText = useMemo(() => {
    const lines: string[] = []
    const outlet = form.outletName.trim() || '—'
    const inv = form.invoiceNumber.trim() || '—'
    const date = form.invoiceDate.trim() || '—'
    const due = form.dueDate.trim() || '—'
    const billFrom = form.billFrom.trim() || '—'
    lines.push(`GELOS INVOICE`)
    lines.push(`Outlet: ${outlet}`)
    lines.push(`Invoice #: ${inv}`)
    lines.push(`Invoice date: ${date}`)
    lines.push(`Payment due: ${due}`)
    lines.push(`Bill from: ${billFrom}`)
    lines.push('')
    lines.push('Items:')
    if (computed.rows.length === 0) lines.push('- (no items)')
    for (const r of computed.rows) {
      lines.push(
        `- ${r.description} · qty ${r.qty} · price ${r.unitPrice} · subtotal ${r.qty * r.unitPrice}`,
      )
    }
    lines.push('')
    lines.push(`Subtotal: ${computed.subtotal}`)
    lines.push(`Discount: ${computed.discount}`)
    if (computed.tax > 0) lines.push(`Tax: ${computed.tax}`)
    lines.push(`Total: ${computed.total}`)
    lines.push('')
    if (form.message.trim()) {
      lines.push('Notes:')
      lines.push(form.message.trim())
      lines.push('')
    }
    return lines.join('\n')
  }, [
    computed.discount,
    computed.rows,
    computed.subtotal,
    computed.tax,
    computed.total,
    form.billFrom,
    form.dueDate,
    form.invoiceDate,
    form.invoiceNumber,
    form.message,
    form.outletName,
  ])

  async function downloadInvoice() {
    try {
      const outlet = form.outletName.trim() || 'invoice'
      const inv = form.invoiceNumber.trim() || 'draft'
      const blob = new Blob([invoiceDocText], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gelos-invoice-${outlet}-${inv}.txt`.replace(/[^\w.-]+/g, '_')
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Invoice downloaded')
    } catch {
      toast.error('Could not download invoice')
    }
  }

  async function shareInvoice() {
    const text = invoiceDocText
    try {
      const anyNav: any = navigator
      if (anyNav?.share) {
        await anyNav.share({
          title: 'GELOS invoice',
          text,
        })
        return
      }
    } catch {
      // fall back to clipboard
    }

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Invoice copied to clipboard')
    } catch {
      toast.error('Could not share/copy invoice')
    }
  }

  function dateToIsoNoon(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map((x) => Number(x))
    if (!y || !m || !d) return new Date().toISOString()
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString()
  }

  async function saveToB2bPayments() {
    const outletName = form.outletName.trim()
    const invoiceNumber = form.invoiceNumber.trim()
    if (!outletName) {
      toast.error('Pick an outlet')
      return
    }
    if (!invoiceNumber) {
      toast.error('Enter invoice number')
      return
    }
    if (computed.rows.length === 0) {
      toast.error('Add at least one item')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/sf/b2b-payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          invoiceNumber,
          invoiceAt: form.invoiceDate.trim() ? dateToIsoNoon(form.invoiceDate) : undefined,
          amountGhs: computed.subtotal + (computed.tax || 0),
          discountGhs: computed.discount > 0 ? computed.discount : undefined,
          paidGhs: 0,
          items: computed.rows.map((r) => ({
            name: r.description,
            qty: r.qty,
            unitPriceGhs: r.unitPrice,
          })),
          dueAt: form.dueDate.trim() ? new Date(dateToIsoNoon(form.dueDate)) : undefined,
          notes: form.message.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to save invoice')
      const created = (await res.json()) as { invoice?: { id: string } }

      // Also store a receipt snapshot for this invoice builder.
      const receiptRes = await fetch('/api/sf/invoice-receipts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          invoiceNumber,
          invoiceAt: form.invoiceDate.trim() ? dateToIsoNoon(form.invoiceDate) : undefined,
          billFrom: form.billFrom.trim() || undefined,
          dueAt: form.dueDate.trim() ? dateToIsoNoon(form.dueDate) : undefined,
          items: computed.rows.map((r) => ({
            description: r.description,
            qty: r.qty,
            unitPriceGhs: r.unitPrice,
          })),
          amountGhs: computed.subtotal,
          discountGhs: computed.discount > 0 ? computed.discount : undefined,
          taxGhs: computed.tax > 0 ? computed.tax : undefined,
          totalGhs: computed.total,
        }),
      })
      if (!receiptRes.ok) {
        // Keep the invoice saved even if receipt fails.
        toast.error('Saved to B2B Payments, but could not store receipt')
      } else {
        toast.success('Invoice saved and receipt created')
      }

      await loadHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Invoices"
        description="Create an invoice with items, discount, and totals. Download/share it, and save it to B2B Payments for history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={saving}
              onClick={() => void saveToB2bPayments()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Save to B2B Payments
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => void downloadInvoice()}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => void shareInvoice()}>
              <Link2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Invoice details
          </div>

          <form className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-outlet">Outlet</Label>
                {outletMode === 'custom' ? (
                  <div className="space-y-2">
                    <Input
                      id="inv-outlet"
                      value={form.outletName}
                      onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                      placeholder="Type custom outlet name"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOutletMode('select')}
                      className="h-8"
                    >
                      Choose from outlets
                    </Button>
                  </div>
                ) : (
                  <Popover open={outletsOpen} onOpenChange={setOutletsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={outletsOpen}
                        className="w-full justify-between"
                      >
                        <span className={cn('truncate text-left', !form.outletName && 'text-muted-foreground')}>
                          {outletLabel}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={outletsLoading ? 'Loading outlets…' : 'Search outlets…'} />
                        <CommandList>
                          <CommandEmpty>
                            <div className="space-y-2 p-2">
                              <p className="text-sm text-muted-foreground">No outlet found.</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setOutletMode('custom')
                                  setOutletsOpen(false)
                                }}
                              >
                                Add custom…
                              </Button>
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__custom__"
                              onSelect={() => {
                                setOutletMode('custom')
                                setOutletsOpen(false)
                              }}
                            >
                              <span className="text-sm">Add custom…</span>
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading="Outlets">
                            {outlets.map((o) => (
                              <CommandItem
                                key={o.outletName}
                                value={o.outletName}
                                onSelect={(value) => {
                                  setForm((f) => ({ ...f, outletName: value }))
                                  setOutletsOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    form.outletName === o.outletName ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{o.outletName}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {o.invoices.toLocaleString()} invoice{o.invoices === 1 ? '' : 's'}
                                    {o.lastInvoiceAt ? ` · last ${new Date(o.lastInvoiceAt).toLocaleDateString()}` : ''}
                                  </p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-number">Invoice #</Label>
                <Input
                  id="inv-number"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder="INV-0001"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-date">Invoice date</Label>
                <Input
                  id="inv-date"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-discount">Discount (GHS)</Label>
                <Input
                  id="inv-discount"
                  inputMode="decimal"
                  value={form.discountGhs}
                  onChange={(e) => setForm((f) => ({ ...f, discountGhs: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-due">Payment due date</Label>
                <Input
                  id="inv-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-bill-from">Bill location (optional)</Label>
                <Input
                  id="inv-bill-from"
                  value={form.billFrom}
                  onChange={(e) => setForm((f) => ({ ...f, billFrom: e.target.value }))}
                  placeholder="e.g. Accra, Ghana"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.includeTax}
                    onChange={(e) => setForm((f) => ({ ...f, includeTax: e.target.checked }))}
                  />
                  Include tax
                </Label>
                <p className="text-xs text-muted-foreground">If enabled, tax is added to total.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-tax">Tax (GHS)</Label>
                <Input
                  id="inv-tax"
                  inputMode="decimal"
                  value={form.taxGhs}
                  onChange={(e) => setForm((f) => ({ ...f, taxGhs: e.target.value }))}
                  placeholder="0.00"
                  disabled={!form.includeTax}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((prev) => [...prev, { description: '', qty: '1', unitPriceGhs: '' }])
                  }
                >
                  Add item
                </Button>
              </div>

              <div className="grid gap-2">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-6">
                      <Label className="sr-only">Description</Label>
                      <Input
                        value={it.description}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, description: e.target.value } : p,
                            ),
                          )
                        }
                        placeholder="Description"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="sr-only">Qty</Label>
                      <Input
                        inputMode="numeric"
                        value={it.qty}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, qty: e.target.value } : p)),
                          )
                        }
                        placeholder="Qty"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="sr-only">Unit price</Label>
                      <Input
                        inputMode="decimal"
                        value={it.unitPriceGhs}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, unitPriceGhs: e.target.value } : p,
                            ),
                          )
                        }
                        placeholder="Price"
                      />
                    </div>

                    <div className="sm:col-span-12 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Subtotal:{' '}
                        <span className="font-medium text-foreground">
                          {formatGhs(
                            (Number(it.qty) || 0) * (Number(it.unitPriceGhs) || 0),
                          )}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={items.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-message">Message</Label>
              <Textarea
                id="inv-message"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={6}
                placeholder="Write a short note. Attachments & PDF generation will be added next."
                className="resize-y"
              />
            </div>
          </form>
          </Card>

          <Card className="p-4">
            <p className="text-sm font-semibold">Totals</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{formatGhs(computed.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium tabular-nums">
                  {computed.discount > 0 ? `−${formatGhs(computed.discount)}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium tabular-nums">
                  {computed.tax > 0 ? formatGhs(computed.tax) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground">Total</span>
                <span className="text-base font-semibold tabular-nums">{formatGhs(computed.total)}</span>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Share uses your device share sheet when available, otherwise it copies the invoice text.
            </p>
          </Card>
        </div>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div>
              <p className="text-sm font-semibold">Invoice history</p>
              <p className="text-xs text-muted-foreground">Receipts created from this invoice page</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()} disabled={historyLoading}>
              {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {historyLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No invoices yet.</div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Outlet</th>
                    <th className="px-4 py-3 text-left">Invoice</th>
                    <th className="px-4 py-3 text-left">Invoice date</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Bill from</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.slice(0, 200).map((h) => (
                    <tr key={h.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{h.outletName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{h.invoiceNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {h.invoiceAt ? new Date(h.invoiceAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {h.dueAt ? new Date(h.dueAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{h.billFrom ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGhs(h.amountGhs ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {h.discountGhs ? `−${formatGhs(h.discountGhs)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {h.taxGhs ? formatGhs(h.taxGhs) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatGhs(h.totalGhs ?? 0)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

