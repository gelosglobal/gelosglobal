'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { format, parse, startOfMonth, endOfMonth } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ListFilter,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings2,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { SellInPageHeader } from '@/components/sell-in/sell-in-page-header'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { cn } from '@/lib/utils'

type ExpenseCategory =
  | 'shipping'
  | 'customs'
  | 'storage'
  | 'logistics'
  | 'marketing'
  | 'samples'
  | 'other'

type PaymentMethod = 'cash' | 'momo' | 'bank_transfer' | 'cheque' | 'card' | 'other'
type ExpenseStatus = 'pending' | 'paid'

type ExpenseRow = {
  id: string
  occurredAt: string
  amountGhs: number
  category: ExpenseCategory
  description: string
  accountId: string
  accountName: string | null
  paymentMethod: PaymentMethod | null
  status: ExpenseStatus | null
  paidBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ExpenseAccountRow = {
  id: string
  name: string
}

type ExpenseForm = ReturnType<typeof emptyForm>

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'shipping', label: 'Shipping' },
  { value: 'customs', label: 'Customs' },
  { value: 'storage', label: 'Storage' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'samples', label: 'Samples' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'momo', label: 'Mobile money' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

function monthKeyForDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatMonthLabel(month: string) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function formatRangeLabel(from: string, to: string) {
  try {
    const a = parse(from, 'yyyy-MM-dd', new Date())
    const b = parse(to, 'yyyy-MM-dd', new Date())
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'custom range'
    if (from === to) return format(a, 'd MMM yyyy')
    if (a.getFullYear() === b.getFullYear()) {
      return `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`
    }
    return `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`
  } catch {
    return 'custom range'
  }
}

function toDateInputValue(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function emptyForm() {
  return {
    occurredAt: new Date().toISOString().slice(0, 10),
    amountGhs: '',
    accountId: '',
    category: 'logistics' as ExpenseCategory,
    description: '',
    paymentMethod: 'momo' as PaymentMethod,
    status: 'pending' as ExpenseStatus,
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

function categoryLabel(cat: ExpenseCategory) {
  return CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat.replace(/_/g, ' ')
}

function paymentLabel(method: PaymentMethod | null) {
  if (!method) return '—'
  return PAYMENT_OPTIONS.find((p) => p.value === method)?.label ?? method.replace(/_/g, ' ')
}

function categoryBadge(cat: ExpenseCategory) {
  const label = categoryLabel(cat)
  if (cat === 'customs' || cat === 'shipping') {
    return <Badge variant="secondary">{label}</Badge>
  }
  if (cat === 'logistics') return <Badge>{label}</Badge>
  return <Badge variant="outline">{label}</Badge>
}

const ACCOUNT_BADGE_STYLES = [
  'bg-sky-600/15 text-sky-800 hover:bg-sky-600/15 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-600/15 text-violet-800 hover:bg-violet-600/15 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-teal-600/15 text-teal-800 hover:bg-teal-600/15 dark:bg-teal-500/20 dark:text-teal-300',
  'bg-rose-600/15 text-rose-800 hover:bg-rose-600/15 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-indigo-600/15 text-indigo-800 hover:bg-indigo-600/15 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-orange-600/15 text-orange-800 hover:bg-orange-600/15 dark:bg-orange-500/20 dark:text-orange-300',
] as const

function accountBadgeStyle(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % ACCOUNT_BADGE_STYLES.length
  return ACCOUNT_BADGE_STYLES[hash] ?? ACCOUNT_BADGE_STYLES[0]
}

function accountBadge(name: string, accountId?: string | null, className?: string) {
  if (!name || name === '—') {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <Badge
      className={cn(
        'max-w-full truncate font-medium',
        accountBadgeStyle(accountId || name),
        className,
      )}
      title={name}
    >
      {name}
    </Badge>
  )
}

function statusBadge(status: ExpenseStatus | null) {
  if (status === 'paid') {
    return (
      <Badge className="bg-emerald-600/15 text-emerald-800 hover:bg-emerald-600/15 dark:bg-emerald-500/20 dark:text-emerald-300">
        Paid
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:bg-amber-500/20 dark:text-amber-300">
      Pending
    </Badge>
  )
}

function ExpensesKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconWrapClass,
  iconClass,
  footer,
}: {
  label: string
  value: ReactNode
  subtitle: ReactNode
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
  footer?: ReactNode
}) {
  return (
    <Card className="dashboard-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          {footer}
        </div>
        <div className={cn('shrink-0 rounded-2xl p-3', iconWrapClass)}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
      </div>
    </Card>
  )
}

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  if (budget <= 0) {
    return (
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-0 rounded-full bg-muted-foreground/30" />
      </div>
    )
  }
  const pct = Math.min(100, (spent / budget) * 100)
  const over = spent > budget
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', over ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function ExpenseFormFields({
  idPrefix,
  form,
  onChange,
  accounts,
  accountsLoading,
}: {
  idPrefix: string
  form: ExpenseForm
  onChange: (patch: Partial<ExpenseForm>) => void
  accounts: ExpenseAccountRow[]
  accountsLoading: boolean
}) {
  const amountPreview = Number(form.amountGhs)
  return (
    <div className="grid gap-5 py-2">
      <FormSection title="Entry">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-date`}>Date</Label>
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={form.occurredAt}
              onChange={(e) => onChange({ occurredAt: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-amt`}>Amount (GHS)</Label>
            <Input
              id={`${idPrefix}-amt`}
              inputMode="decimal"
              value={form.amountGhs}
              onChange={(e) => onChange({ amountGhs: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Amount{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {Number.isFinite(amountPreview) && amountPreview >= 0
              ? formatGhs(amountPreview)
              : '—'}
          </span>
        </div>
      </FormSection>

      <FormSection title="Classification">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={form.accountId} onValueChange={(v) => onChange({ accountId: v })}>
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
              onValueChange={(v) => onChange({ category: v as ExpenseCategory })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-desc`}>Description</Label>
          <Input
            id={`${idPrefix}-desc`}
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="e.g. Clearing fee, trucking, demurrage…"
            required
          />
        </div>
      </FormSection>

      <FormSection title="Payment">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => onChange({ status: v as ExpenseStatus })}
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
              onValueChange={(v) => onChange({ paymentMethod: v as PaymentMethod })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-paidby`}>Paid by (optional)</Label>
          <Input
            id={`${idPrefix}-paidby`}
            value={form.paidBy}
            onChange={(e) => onChange({ paidBy: e.target.value })}
            placeholder="Name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-notes`}>Notes (optional)</Label>
          <Textarea
            id={`${idPrefix}-notes`}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={3}
            className="resize-y"
          />
        </div>
      </FormSection>
    </div>
  )
}

function AccountSpendCard({
  account,
  spent,
  budget,
  entryCount,
  periodLabel = 'this month',
  onOpen,
  swipeFriendly = false,
}: {
  account: ExpenseAccountRow
  spent: number
  budget: number
  entryCount: number
  periodLabel?: string
  onOpen: () => void
  /** Prefer swipe over click when used inside a carousel */
  swipeFriendly?: boolean
}) {
  const remaining = Math.max(0, budget - spent)
  const overBy = budget > 0 && spent > budget ? spent - budget : 0
  const usedPct = budget > 0 ? Math.min(999, Math.round((spent / budget) * 1000) / 10) : null
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)

  function handlePointerDown(e: React.PointerEvent) {
    if (!swipeFriendly) return
    pointerStart.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!swipeFriendly || !pointerStart.current) return
    const dx = Math.abs(e.clientX - pointerStart.current.x)
    const dy = Math.abs(e.clientY - pointerStart.current.y)
    if (dx > 8 || dy > 8) didDrag.current = true
  }

  function handleActivate() {
    if (swipeFriendly && didDrag.current) return
    onOpen()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        pointerStart.current = null
      }}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group h-full w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        swipeFriendly && 'select-none touch-pan-y',
      )}
      aria-label={`View details for ${account.name}`}
    >
      <Card className="dashboard-card pointer-events-none h-full p-5 transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {accountBadge(account.name, account.id)}
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatGhs(spent)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'} · {periodLabel}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge variant="outline" className="tabular-nums">
              {usedPct == null ? 'No budget' : `${usedPct}%`}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </div>
        <BudgetBar spent={spent} budget={budget} />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Budget {formatGhs(budget)}</span>
          {overBy > 0 ? (
            <span className="font-medium text-destructive">Over {formatGhs(overBy)}</span>
          ) : (
            <span>Left {formatGhs(remaining)}</span>
          )}
        </div>
      </Card>
    </div>
  )
}

function accountNameFor(
  row: ExpenseRow,
  accounts: ExpenseAccountRow[],
): string {
  return row.accountName ?? accounts.find((a) => a.id === row.accountId)?.name ?? '—'
}

export function SellInExpensesView() {
  const [dateMode, setDateMode] = useState<'month' | 'custom'>('month')
  const [month, setMonth] = useState(() => monthKeyForDate(new Date()))
  const [rangeFrom, setRangeFrom] = useState(() => toDateInputValue(startOfMonth(new Date())))
  const [rangeTo, setRangeTo] = useState(() => toDateInputValue(endOfMonth(new Date())))
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [accountFilter, setAccountFilter] = useState<'all' | string>('all')

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
  const [deleting, setDeleting] = useState(false)
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)
  const [allAccountsOpen, setAllAccountsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let qs: URLSearchParams
      if (dateMode === 'custom') {
        const from = parse(rangeFrom, 'yyyy-MM-dd', new Date())
        const to = parse(rangeTo, 'yyyy-MM-dd', new Date())
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          throw new Error('Invalid custom range')
        }
        if (from.getTime() > to.getTime()) {
          throw new Error('Start must be before end')
        }
        qs = new URLSearchParams({
          start: `${rangeFrom}T00:00:00.000`,
          end: `${rangeTo}T23:59:59.999`,
        })
      } else {
        qs = new URLSearchParams({ month })
      }

      const res = await fetch(`/api/sell-in/expenses?${qs.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { rows: ExpenseRow[] }
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === 'Start must be before end'
          ? 'Start date must be before end date'
          : 'Could not load expenses',
      )
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [dateMode, month, rangeFrom, rangeTo])

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
      const res = await fetch(
        `/api/sell-in/expenses/accounts/budgets?month=${encodeURIComponent(month)}`,
        { credentials: 'include' },
      )
      if (!res.ok) throw new Error('Failed to load budgets')
      const data = (await res.json()) as {
        budgets: Array<{ accountId: string; budgetGhs: number }>
      }
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

  const byAccount = useMemo(() => {
    const spentBy: Record<string, number> = {}
    for (const r of rows) {
      const id = r.accountId
      if (!id) continue
      spentBy[id] = (spentBy[id] ?? 0) + (Number(r.amountGhs) || 0)
    }
    return spentBy
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      const status = (r.status ?? 'pending') as ExpenseStatus
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false
      if (accountFilter !== 'all' && r.accountId !== accountFilter) return false
      if (!q) return true
      const account = accountNameFor(r, accounts).toLowerCase()
      return (
        r.description.toLowerCase().includes(q) ||
        account.includes(q) ||
        categoryLabel(r.category).toLowerCase().includes(q) ||
        paymentLabel(r.paymentMethod).toLowerCase().includes(q) ||
        (r.paidBy ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q) ||
        String(r.amountGhs).includes(q)
      )
    })
  }, [rows, query, statusFilter, categoryFilter, accountFilter, accounts])

  const totals = useMemo(() => {
    let total = 0
    let paid = 0
    let pending = 0
    let paidAmt = 0
    let pendingAmt = 0
    for (const r of filtered) {
      const amt = Number(r.amountGhs) || 0
      total += amt
      if (r.status === 'paid') {
        paid += 1
        paidAmt += amt
      } else {
        pending += 1
        pendingAmt += amt
      }
    }
    return { total, paid, pending, paidAmt, pendingAmt, entries: filtered.length }
  }, [filtered])

  const statusCounts = useMemo(() => {
    let paid = 0
    let pending = 0
    for (const r of rows) {
      if (r.status === 'paid') paid += 1
      else pending += 1
    }
    return { all: rows.length, paid, pending }
  }, [rows])

  const filtersActive =
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    accountFilter !== 'all' ||
    query.trim() !== ''

  const deleteTarget = deleteId ? rows.find((r) => r.id === deleteId) : null
  const detailAccount = detailAccountId
    ? accounts.find((a) => a.id === detailAccountId) ?? null
    : null
  const detailRows = useMemo(() => {
    if (!detailAccountId) return [] as ExpenseRow[]
    return rows
      .filter((r) => r.accountId === detailAccountId)
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  }, [rows, detailAccountId])

  const detailStats = useMemo(() => {
    let spent = 0
    let paidAmt = 0
    let pendingAmt = 0
    let paid = 0
    let pending = 0
    const byCat = new Map<ExpenseCategory, number>()
    for (const r of detailRows) {
      const amt = Number(r.amountGhs) || 0
      spent += amt
      if (r.status === 'paid') {
        paid += 1
        paidAmt += amt
      } else {
        pending += 1
        pendingAmt += amt
      }
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + amt)
    }
    const categories = [...byCat.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
    return { spent, paidAmt, pendingAmt, paid, pending, categories, entries: detailRows.length }
  }, [detailRows])

  const monthLabel = formatMonthLabel(month)
  const rangeLabel =
    dateMode === 'custom' ? formatRangeLabel(rangeFrom, rangeTo) : monthLabel
  const totalBudget = accounts.reduce((sum, a) => sum + (budgets[a.id] ?? 0), 0)
  const totalSpentAll = rows.reduce((sum, r) => sum + (Number(r.amountGhs) || 0), 0)

  function switchDateMode(mode: 'month' | 'custom') {
    if (mode === dateMode) return
    if (mode === 'custom') {
      try {
        const ref = parse(`${month}-01`, 'yyyy-MM-dd', new Date())
        setRangeFrom(toDateInputValue(startOfMonth(ref)))
        setRangeTo(toDateInputValue(endOfMonth(ref)))
      } catch {
        const now = new Date()
        setRangeFrom(toDateInputValue(startOfMonth(now)))
        setRangeTo(toDateInputValue(endOfMonth(now)))
      }
    } else {
      // Keep budget month aligned with the custom range end when returning to month mode.
      const end = parse(rangeTo, 'yyyy-MM-dd', new Date())
      if (!Number.isNaN(end.getTime())) setMonth(monthKeyForDate(end))
    }
    setDateMode(mode)
  }

  function openCreateForAccount(accountId: string) {
    setForm((f) => ({ ...f, accountId }))
    setDetailAccountId(null)
    setCreateOpen(true)
  }

  function filterLedgerToAccount(accountId: string) {
    setAccountFilter(accountId)
    setDetailAccountId(null)
  }

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
      paymentMethod: (r.paymentMethod ?? 'momo') as PaymentMethod,
      status: (r.status ?? 'pending') as ExpenseStatus,
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
    setDeleting(true)
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
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setQuery('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setAccountFilter('all')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SellInPageHeader
        title="Expenses"
        description="Track sell-in shipment, customs, logistics, and related costs against monthly budgets."
        meta={
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Viewing {rangeLabel}
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={dateMode}
              onValueChange={(v) => switchDateMode(v as 'month' | 'custom')}
            >
              <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Date mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">By month</SelectItem>
                <SelectItem value="custom">Custom date</SelectItem>
              </SelectContent>
            </Select>
            {dateMode === 'month' ? (
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 w-[10.5rem]"
                aria-label="Expense month"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="h-9 w-[9.75rem]"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="h-9 w-[9.75rem]"
                  aria-label="To date"
                />
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setAccountsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              Accounts & budgets
            </Button>
            <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                setCreateOpen(open)
                if (!open) setForm(emptyForm())
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add expense
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(92vh,44rem)] overflow-y-auto sm:max-w-xl">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add expense</DialogTitle>
                    <DialogDescription>
                      Log a sell-in related cost against an account.
                    </DialogDescription>
                  </DialogHeader>
                  <ExpenseFormFields
                    idPrefix="se"
                    form={form}
                    onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                    accounts={accounts}
                    accountsLoading={accountsLoading}
                  />
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating || accounts.length === 0}>
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving
                        </>
                      ) : (
                        'Add expense'
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ExpensesKpiCard
            label="Total spent"
            value={loading ? '—' : formatGhs(totals.total)}
            subtitle={
              filtersActive
                ? `${totals.entries} matching ${totals.entries === 1 ? 'entry' : 'entries'}`
                : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} in ${rangeLabel}`
            }
            icon={Wallet}
            iconWrapClass="bg-muted"
            iconClass="text-foreground"
            footer={
              dateMode === 'month' && totalBudget > 0 && !filtersActive ? (
                <>
                  <BudgetBar spent={totalSpentAll} budget={totalBudget} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    of {formatGhs(totalBudget)} budgeted
                  </p>
                </>
              ) : null
            }
          />
          <ExpensesKpiCard
            label="Paid"
            value={loading ? '—' : formatGhs(totals.paidAmt)}
            subtitle={`${totals.paid} settled`}
            icon={CircleDollarSign}
            iconWrapClass="bg-emerald-500/15"
            iconClass="text-emerald-700 dark:text-emerald-300"
          />
          <ExpensesKpiCard
            label="Pending"
            value={loading ? '—' : formatGhs(totals.pendingAmt)}
            subtitle={`${totals.pending} outstanding`}
            icon={Receipt}
            iconWrapClass="bg-amber-500/15"
            iconClass="text-amber-700 dark:text-amber-300"
          />
          <ExpensesKpiCard
            label="Accounts"
            value={loading ? '—' : accounts.length}
            subtitle="With monthly budgets"
            icon={ListFilter}
            iconWrapClass="bg-sky-500/15"
            iconClass="text-sky-700 dark:text-sky-300"
          />
        </div>

        {accounts.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
                <p className="text-xs text-muted-foreground">
                  Swipe to browse · {accounts.length} total
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAllAccountsOpen(true)}
              >
                More
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Carousel
              opts={{
                align: 'start',
                containScroll: 'trimSnaps',
                skipSnaps: false,
                dragFree: false,
                watchDrag: true,
              }}
              className="w-full touch-pan-y"
            >
              <CarouselContent className="-ml-3 cursor-grab active:cursor-grabbing sm:-ml-4">
                {accounts.map((a) => {
                  const entryCount = rows.filter((r) => r.accountId === a.id).length
                  return (
                    <CarouselItem
                      key={a.id}
                      className="basis-[85%] pl-3 sm:basis-[48%] sm:pl-4 lg:basis-[32%]"
                    >
                      <AccountSpendCard
                        account={a}
                        spent={byAccount[a.id] ?? 0}
                        budget={dateMode === 'month' ? budgets[a.id] ?? 0 : 0}
                        entryCount={entryCount}
                        periodLabel={rangeLabel}
                        swipeFriendly
                        onOpen={() => setDetailAccountId(a.id)}
                      />
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
              <CarouselPrevious className="left-1 top-1/2 z-10 hidden translate-y-[-50%] border bg-background/95 shadow-sm sm:flex" />
              <CarouselNext className="right-1 top-1/2 z-10 hidden translate-y-[-50%] border bg-background/95 shadow-sm sm:flex" />
            </Carousel>
          </div>
        ) : !accountsLoading ? (
          <Card className="border-dashed p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Set up an account</p>
                <p className="text-sm text-muted-foreground">
                  Create accounts and budgets before logging expenses.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAccountsOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
                Accounts & budgets
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'all' as const, label: 'All', count: statusCounts.all },
                { value: 'pending' as const, label: 'Pending', count: statusCounts.pending },
                { value: 'paid' as const, label: 'Paid', count: statusCounts.paid },
              ] as const
            ).map((chip) => {
              const active = statusFilter === chip.value
              return (
                <Button
                  key={chip.value}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-8 gap-1.5 rounded-full px-3"
                  onClick={() => setStatusFilter(chip.value)}
                >
                  {chip.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      active ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {chip.count}
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-9"
                placeholder="Search description, account…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search expenses"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as 'all' | ExpenseCategory)}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length > 0 ? (
              <Select
                value={accountFilter}
                onValueChange={(v) => setAccountFilter(v)}
              >
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter by account">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {filtersActive ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Expense ledger</h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Loading…'
                  : `${filtered.length} of ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${rangeLabel}`}
              </p>
            </div>
            <Receipt className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No expenses for {rangeLabel}</EmptyTitle>
                <EmptyDescription>
                  {accounts.length === 0
                    ? 'Create an account first, then log shipping, customs, or logistics costs.'
                    : 'Add your first expense to start tracking spend against budgets.'}
                </EmptyDescription>
              </EmptyHeader>
              {accounts.length === 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAccountsOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  Set up accounts
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add expense
                </Button>
              )}
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="border-0 py-14">
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  Try another search or filter, or reset to see all expenses this month.
                </EmptyDescription>
              </EmptyHeader>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            </Empty>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {filtered.map((r) => (
                  <div key={r.id} className="space-y-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{r.description}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(r.occurredAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatGhs(r.amountGhs)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {accountBadge(accountNameFor(r, accounts), r.accountId)}
                      {statusBadge(r.status)}
                      {categoryBadge(r.category)}
                      <span className="text-xs text-muted-foreground">
                        {paymentLabel(r.paymentMethod)}
                      </span>
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit ${r.description}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(r.id)}
                        aria-label={`Delete ${r.description}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="hidden xl:table-cell">Payment</TableHead>
                      <TableHead className="hidden lg:table-cell">Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[88px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{r.description}</p>
                            <div className="mt-1 lg:hidden">
                              {accountBadge(accountNameFor(r, accounts), r.accountId)}
                            </div>
                            {r.paidBy ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Paid by {r.paidBy}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {accountBadge(accountNameFor(r, accounts), r.accountId)}
                        </TableCell>
                        <TableCell>{categoryBadge(r.category)}</TableCell>
                        <TableCell className="hidden text-muted-foreground xl:table-cell">
                          {paymentLabel(r.paymentMethod)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {format(new Date(r.occurredAt), 'd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatGhs(r.amountGhs)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(r)}
                              aria-label={`Edit ${r.description}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(r.id)}
                              aria-label={`Delete ${r.description}`}
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
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setEditId(null)
        }}
      >
        <DialogContent className="max-h-[min(92vh,44rem)] overflow-y-auto sm:max-w-xl">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit expense</DialogTitle>
              <DialogDescription>Update amount, status, account, or notes.</DialogDescription>
            </DialogHeader>
            <ExpenseFormFields
              idPrefix="se-edit"
              form={editForm}
              onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
              accounts={accounts}
              accountsLoading={accountsLoading}
            />
            <DialogFooter className="gap-2 sm:gap-0">
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

      <Dialog open={accountsOpen} onOpenChange={setAccountsOpen}>
        <DialogContent className="max-h-[min(92vh,40rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Accounts & budgets</DialogTitle>
            <DialogDescription>
              Create accounts and set monthly budgets for {monthLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <FormSection title="New account">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="se-new-acct"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Ads, Logistics, Customs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addAccount()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void addAccount()}
                  disabled={savingAccount}
                >
                  {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </FormSection>

            <FormSection title={`Budgets · ${monthLabel}`}>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <div className="space-y-3">
                  {accounts.map((a) => {
                    const spent = byAccount[a.id] ?? 0
                    const budget = budgets[a.id] ?? 0
                    return (
                      <div
                        key={a.id}
                        className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            {accountBadge(a.name, a.id)}
                            <p className="text-xs text-muted-foreground">
                              Spent {formatGhs(spent)}
                              {budget > 0 ? ` of ${formatGhs(budget)}` : ''}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteAccountId(a.id)}
                            aria-label={`Delete ${a.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <BudgetBar spent={spent} budget={budget} />
                        <div className="flex gap-2">
                          <Input
                            inputMode="decimal"
                            aria-label={`Budget for ${a.name}`}
                            value={String(budgets[a.id] ?? 0)}
                            onChange={(e) =>
                              setBudgets((b) => ({ ...b, [a.id]: Number(e.target.value) || 0 }))
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={savingBudget === a.id}
                            onClick={() => void setBudgetForAccount(a.id, budgets[a.id] ?? 0)}
                          >
                            {savingBudget === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Save'
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </FormSection>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={allAccountsOpen} onOpenChange={setAllAccountsOpen}>
        <DialogContent className="max-h-[min(92vh,44rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>All accounts</DialogTitle>
            <DialogDescription>
              {accounts.length} accounts for {rangeLabel}. Tap any card for details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            {accounts.map((a) => {
              const entryCount = rows.filter((r) => r.accountId === a.id).length
              return (
                <AccountSpendCard
                  key={a.id}
                  account={a}
                  spent={byAccount[a.id] ?? 0}
                  budget={dateMode === 'month' ? budgets[a.id] ?? 0 : 0}
                  entryCount={entryCount}
                  periodLabel={rangeLabel}
                  onOpen={() => {
                    setAllAccountsOpen(false)
                    setDetailAccountId(a.id)
                  }}
                />
              )
            })}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setAllAccountsOpen(false)
                setAccountsOpen(true)
              }}
            >
              <Settings2 className="h-4 w-4" />
              Manage budgets
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAllAccountsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={detailAccountId != null}
        onOpenChange={(open) => {
          if (!open) setDetailAccountId(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md"
        >
          {detailAccount ? (
            (() => {
              const budget = budgets[detailAccount.id] ?? 0
              const spent = detailStats.spent
              const remaining = Math.max(0, budget - spent)
              const overBy = budget > 0 && spent > budget ? spent - budget : 0
              const usedPct =
                budget > 0 ? Math.min(999, Math.round((spent / budget) * 1000) / 10) : null
              return (
                <>
                  <SheetHeader className="border-b border-border px-4 py-5 pr-12 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      {accountBadge(detailAccount.name, detailAccount.id)}
                      {usedPct != null ? (
                        <Badge variant="outline" className="tabular-nums">
                          {usedPct}% used
                        </Badge>
                      ) : null}
                    </div>
                    <SheetTitle className="sr-only">{detailAccount.name}</SheetTitle>
                    <SheetDescription>
                      Account details for {rangeLabel}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-6 px-4 py-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Spent this month
                      </p>
                      <p className="mt-1 text-3xl font-bold tabular-nums">{formatGhs(spent)}</p>
                      <BudgetBar spent={spent} budget={budget} />
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Budget</p>
                          <p className="font-medium tabular-nums">{formatGhs(budget)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {overBy > 0 ? 'Over by' : 'Remaining'}
                          </p>
                          <p
                            className={cn(
                              'font-medium tabular-nums',
                              overBy > 0 && 'text-destructive',
                            )}
                          >
                            {formatGhs(overBy > 0 ? overBy : remaining)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatGhs(detailStats.paidAmt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {detailStats.paid} {detailStats.paid === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Pending</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                          {formatGhs(detailStats.pendingAmt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {detailStats.pending} {detailStats.pending === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                    </div>

                    {detailStats.categories.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          By category
                        </p>
                        <div className="space-y-2">
                          {detailStats.categories.map(({ category, amount }) => {
                            const share =
                              spent > 0 ? Math.round((amount / spent) * 1000) / 10 : 0
                            return (
                              <div
                                key={category}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {categoryBadge(category)}
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {share}%
                                  </span>
                                </div>
                                <span className="shrink-0 text-sm font-medium tabular-nums">
                                  {formatGhs(amount)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Expenses
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {detailStats.entries}{' '}
                          {detailStats.entries === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>
                      {detailRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            No expenses on this account for {rangeLabel}.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                          {detailRows.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-start justify-between gap-3 px-3 py-3"
                            >
                              <div className="min-w-0 space-y-1.5">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {r.description}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {statusBadge(r.status)}
                                  {categoryBadge(r.category)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(r.occurredAt), 'd MMM yyyy')}
                                  {r.paymentMethod
                                    ? ` · ${paymentLabel(r.paymentMethod)}`
                                    : ''}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <p className="text-sm font-semibold tabular-nums">
                                  {formatGhs(r.amountGhs)}
                                </p>
                                <div className="flex gap-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setDetailAccountId(null)
                                      openEdit(r)
                                    }}
                                    aria-label={`Edit ${r.description}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setDetailAccountId(null)
                                      setDeleteId(r.id)
                                    }}
                                    aria-label={`Delete ${r.description}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <SheetFooter className="border-t border-border bg-muted/20 sm:flex-col">
                    <Button
                      type="button"
                      className="w-full gap-1.5"
                      onClick={() => openCreateForAccount(detailAccount.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add expense
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => filterLedgerToAccount(detailAccount.id)}
                    >
                      Filter ledger to this account
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setDetailAccountId(null)
                        setAccountsOpen(true)
                      }}
                    >
                      <Settings2 className="h-4 w-4" />
                      Manage budget
                    </Button>
                  </SheetFooter>
                </>
              )
            })()
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteAccountId != null}
        onOpenChange={(o) => !o && setDeleteAccountId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account. If it has expenses logged, move or delete those first.
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
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove “${deleteTarget.description}”.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
