'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Pencil, Plus, Settings2, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { SellInPageHeader } from '@/components/sell-in/sell-in-page-header'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { formatGhs } from '@/lib/dtc-orders'

type ExpenseCategory =
  | 'shipping'
  | 'customs'
  | 'storage'
  | 'logistics'
  | 'marketing'
  | 'samples'
  | 'other'

type ExpenseRow = {
  id: string
  occurredAt: string
  amountGhs: number
  category: ExpenseCategory
  description: string
  accountId: string
  accountName: string | null
  paymentMethod: 'cash' | 'momo' | 'bank_transfer' | 'cheque' | 'card' | 'other' | null
  status: 'pending' | 'paid' | null
  paidBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ExpenseAccountRow = {
  id: string
  name: string
}

function monthKeyForDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function emptyForm() {
  return {
    occurredAt: new Date().toISOString().slice(0, 10),
    amountGhs: '',
    accountId: '',
    category: 'logistics' as ExpenseCategory,
    description: '',
    paymentMethod: 'momo' as const,
    status: 'pending' as const,
    paidBy: '',
    notes: '',
  }
}

function dateToIsoNoon(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function categoryBadge(cat: ExpenseCategory) {
  const label = cat.replace(/_/g, ' ')
  if (cat === 'customs') return <Badge variant="secondary">{label}</Badge>
  if (cat === 'shipping') return <Badge variant="secondary">{label}</Badge>
  if (cat === 'logistics') return <Badge>{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}

export function SellInExpensesView() {
  const [month, setMonth] = useState(() => monthKeyForDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ExpenseRow[]>([])

  const [accounts, setAccounts] = useState<ExpenseAccountRow[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [newAccountName, setNewAccountName] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingBudget, setSavingBudget] = useState<string | null>(null)
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sell-in/expenses?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { rows: ExpenseRow[] }
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch {
      toast.error('Could not load expenses')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await fetch('/api/sell-in/expenses/accounts', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load accounts')
      const data = (await res.json()) as { accounts: ExpenseAccountRow[] }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch {
      toast.error('Could not load accounts')
      setAccounts([])
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  const loadBudgets = useCallback(async () => {
    try {
      const res = await fetch(`/api/sell-in/expenses/accounts/budgets?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load budgets')
      const data = (await res.json()) as { budgets: Array<{ accountId: string; budgetGhs: number }> }
      const map: Record<string, number> = {}
      for (const b of data.budgets ?? []) {
        map[String(b.accountId)] = Number(b.budgetGhs) || 0
      }
      setBudgets(map)
    } catch {
      toast.error('Could not load budgets')
      setBudgets({})
    }
  }, [month])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    void loadBudgets()
  }, [loadBudgets])

  const totals = useMemo(() => {
    let total = 0
    const byCat = new Map<ExpenseCategory, number>()
    for (const r of rows) {
      const amt = Number(r.amountGhs) || 0
      total += amt
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + amt)
    }
    return { total, byCat }
  }, [rows])

  const byAccount = useMemo(() => {
    const spentBy: Record<string, number> = {}
    for (const r of rows) {
      const id = r.accountId
      if (!id) continue
      spentBy[id] = (spentBy[id] ?? 0) + (Number(r.amountGhs) || 0)
    }
    return spentBy
  }, [rows])

  async function addAccount() {
    const name = newAccountName.trim()
    if (!name) return toast.error('Enter an account name')
    setSavingAccount(true)
    try {
      const res = await fetch('/api/sell-in/expenses/accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to add account')
      toast.success('Account added')
      setNewAccountName('')
      await loadAccounts()
    } catch {
      toast.error('Could not add account')
    } finally {
      setSavingAccount(false)
    }
  }

  async function deleteAccountConfirmed() {
    if (!deleteAccountId) return
    try {
      const res = await fetch(`/api/sell-in/expenses/accounts/${deleteAccountId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 409) {
        toast.error('Account has expenses. Move them to another account first.')
        return
      }
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Account deleted')
      setDeleteAccountId(null)
      await loadAccounts()
      await loadBudgets()
    } catch {
      toast.error('Could not delete account')
    }
  }

  async function setBudgetForAccount(accountId: string, budgetGhs: number) {
    setSavingBudget(accountId)
    try {
      const res = await fetch('/api/sell-in/expenses/accounts/budgets', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, accountId, budgetGhs }),
      })
      if (!res.ok) throw new Error('Failed to save budget')
      await loadBudgets()
      toast.success('Budget saved')
    } catch {
      toast.error('Could not save budget')
    } finally {
      setSavingBudget(null)
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const amountGhs = Number(form.amountGhs)
    const occurredAt = dateToIsoNoon(form.occurredAt)
    if (!occurredAt) return toast.error('Pick a valid date')
    if (!Number.isFinite(amountGhs) || amountGhs < 0) return toast.error('Enter a valid amount')
    if (!form.accountId) return toast.error('Pick an account')
    if (!form.description.trim()) return toast.error('Description is required')

    setCreating(true)
    try {
      const res = await fetch('/api/sell-in/expenses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: form.accountId,
          occurredAt,
          amountGhs,
          category: form.category,
          description: form.description,
          paymentMethod: form.paymentMethod,
          status: form.status,
          paidBy: form.paidBy.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Create failed')
      toast.success('Expense added')
      setCreateOpen(false)
      setForm(emptyForm())
      await load()
    } catch {
      toast.error('Could not add expense')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(r: ExpenseRow) {
    setEditId(r.id)
    setEditForm({
      occurredAt: r.occurredAt.slice(0, 10),
      amountGhs: String(r.amountGhs),
      accountId: r.accountId,
      category: r.category,
      description: r.description,
      paymentMethod: (r.paymentMethod ?? 'momo') as any,
      status: (r.status ?? 'pending') as any,
      paidBy: r.paidBy ?? '',
      notes: r.notes ?? '',
    })
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const amountGhs = Number(editForm.amountGhs)
    const occurredAt = dateToIsoNoon(editForm.occurredAt)
    if (!occurredAt) return toast.error('Pick a valid date')
    if (!Number.isFinite(amountGhs) || amountGhs < 0) return toast.error('Enter a valid amount')
    if (!editForm.accountId) return toast.error('Pick an account')
    if (!editForm.description.trim()) return toast.error('Description is required')

    setEditing(true)
    try {
      const res = await fetch(`/api/sell-in/expenses/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: editForm.accountId,
          occurredAt,
          amountGhs,
          category: editForm.category,
          description: editForm.description,
          paymentMethod: editForm.paymentMethod,
          status: editForm.status,
          paidBy: editForm.paidBy.trim() === '' ? null : editForm.paidBy.trim(),
          notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
        }),
      })
      if (!res.ok) throw new Error('Update failed')
      toast.success('Expense updated')
      setEditOpen(false)
      setEditId(null)
      await load()
    } catch {
      toast.error('Could not update expense')
    } finally {
      setEditing(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/sell-in/expenses/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Expense deleted')
      setDeleteId(null)
      await load()
    } catch {
      toast.error('Could not delete expense')
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SellInPageHeader
        title="Expenses"
        description="Log expenses related to sell-in shipments, customs, logistics, storage, and more."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44"
              />
            </div>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => setAccountsOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Accounts & budgets
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add expense</DialogTitle>
                    <DialogDescription>Log a sell-in related expense entry.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="se-date">Date</Label>
                        <Input
                          id="se-date"
                          type="date"
                          value={form.occurredAt}
                          onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="se-amt">Amount (GHS)</Label>
                        <Input
                          id="se-amt"
                          inputMode="decimal"
                          value={form.amountGhs}
                          onChange={(e) => setForm((f) => ({ ...f, amountGhs: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Account</Label>
                        <Select
                          value={form.accountId}
                          onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={accountsLoading ? 'Loading…' : 'Select account'} />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={form.category}
                          onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExpenseCategory }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shipping">Shipping</SelectItem>
                            <SelectItem value="customs">Customs</SelectItem>
                            <SelectItem value="storage">Storage</SelectItem>
                            <SelectItem value="logistics">Logistics</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="samples">Samples</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment method</Label>
                        <Select
                          value={form.paymentMethod}
                          onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as any }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="momo">Mobile money</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="se-desc">Description</Label>
                      <Input
                        id="se-desc"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. Clearing fee, trucking, container demurrage…"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="se-paidby">Paid by (optional)</Label>
                      <Input
                        id="se-paidby"
                        value={form.paidBy}
                        onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}
                        placeholder="Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="se-notes">Notes (optional)</Label>
                      <Textarea
                        id="se-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
                        'Add'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total expenses</p>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatGhs(totals.total)}</p>
            <p className="text-xs text-muted-foreground">{rows.length.toLocaleString()} entries</p>
          </Card>
          {accounts.map((a) => {
            const budget = budgets[a.id] ?? 0
            const spent = byAccount[a.id] ?? 0
            const remaining = Math.max(0, budget - spent)
            const overBy = budget > 0 && spent > budget ? spent - budget : 0
            const usedPct = budget > 0 ? Math.min(999, Math.round((spent / budget) * 1000) / 10) : null
            return (
              <Card key={a.id} className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">{a.name}</p>
                <p className="mt-2 text-xl font-bold tabular-nums">{formatGhs(spent)}</p>
                <p className="text-xs text-muted-foreground">
                  Budget {formatGhs(budget)} · Used {usedPct == null ? '—' : `${usedPct}%`}
                </p>
                {overBy > 0 ? (
                  <p className="text-xs text-destructive">Over by {formatGhs(overBy)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Remaining {formatGhs(remaining)}</p>
                )}
              </Card>
            )
          })}
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Expense ledger</h2>
            <p className="text-xs text-muted-foreground">Newest first</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[980px] w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Payment</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Paid by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[88px] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(r.occurredAt), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.accountName ?? accounts.find((a) => a.id === r.accountId)?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        {r.status === 'paid' ? (
                          <span className="text-emerald-600">Paid</span>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {r.paymentMethod ? r.paymentMethod.replace(/_/g, ' ') : '—'}
                      </TableCell>
                      <TableCell>{categoryBadge(r.category)}</TableCell>
                      <TableCell className="font-medium">{r.description}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{r.paidBy ?? '—'}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatGhs(r.amountGhs)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label="Edit expense"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(r.id)}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
              <DialogTitle>Edit expense</DialogTitle>
              <DialogDescription>Update the expense entry details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="se-edit-date">Date</Label>
                  <Input
                    id="se-edit-date"
                    type="date"
                    value={editForm.occurredAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="se-edit-amt">Amount (GHS)</Label>
                  <Input
                    id="se-edit-amt"
                    inputMode="decimal"
                    value={editForm.amountGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, amountGhs: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select
                    value={editForm.accountId}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, accountId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={accountsLoading ? 'Loading…' : 'Select account'} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={editForm.category}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, category: v as ExpenseCategory }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shipping">Shipping</SelectItem>
                      <SelectItem value="customs">Customs</SelectItem>
                      <SelectItem value="storage">Storage</SelectItem>
                      <SelectItem value="logistics">Logistics</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="samples">Samples</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status as any}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <Select
                    value={editForm.paymentMethod as any}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, paymentMethod: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="momo">Mobile money</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="se-edit-desc">Description</Label>
                <Input
                  id="se-edit-desc"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="se-edit-paidby">Paid by (optional)</Label>
                <Input
                  id="se-edit-paidby"
                  value={editForm.paidBy}
                  onChange={(e) => setEditForm((f) => ({ ...f, paidBy: e.target.value }))}
                  placeholder="Clear to remove"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="se-edit-notes">Notes (optional)</Label>
                <Textarea
                  id="se-edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="resize-y"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editing}>
                {editing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={accountsOpen} onOpenChange={setAccountsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Accounts & budgets</DialogTitle>
            <DialogDescription>
              Create accounts (e.g. Ads) and set monthly budgets for {month}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="se-new-acct">New account</Label>
                <Input
                  id="se-new-acct"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Ads account"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" className="w-full" variant="outline" onClick={() => void addAccount()} disabled={savingAccount}>
                  {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budgets</Label>
              <div className="space-y-2">
                {accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No accounts yet.</p>
                ) : (
                  accounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-md border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Spent: {formatGhs(byAccount[a.id] ?? 0)}
                        </p>
                      </div>
                      <div className="w-40">
                        <Input
                          inputMode="decimal"
                          value={String(budgets[a.id] ?? 0)}
                          onChange={(e) =>
                            setBudgets((b) => ({ ...b, [a.id]: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingBudget === a.id}
                        onClick={() => void setBudgetForAccount(a.id, budgets[a.id] ?? 0)}
                      >
                        {savingBudget === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteAccountId(a.id)}
                        aria-label="Delete account"
                        title="Delete account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAccountId != null} onOpenChange={(o) => !o && setDeleteAccountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account. If the account has expenses logged, you must move/delete those expenses first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteAccountConfirmed()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

