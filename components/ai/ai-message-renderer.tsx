'use client'

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Minus,
  Sparkles,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type {
  AiContextHighlight,
  AiResponseBlock,
  AiStructuredResponse,
} from '@/lib/ai-response'
import { normalizeProgressValue } from '@/lib/ai-response'
import { cn } from '@/lib/utils'

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  '#6366f1',
  '#14b8a6',
]

function TrendIcon({ trend }: { trend?: 'up' | 'down' | 'neutral' }) {
  if (trend === 'up') return <ArrowUpRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
  if (trend === 'down') return <ArrowDownRight className="h-3 w-3 text-rose-600 dark:text-rose-400" />
  return <Minus className="h-3 w-3 text-muted-foreground" />
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function HighlightGrid({ items }: { items: AiContextHighlight[] }) {
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <Card
          key={item.id}
          className="border-border/60 bg-gradient-to-br from-card to-muted/30 p-3 shadow-none dark:from-card dark:to-muted/20"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-foreground">
            {item.value}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendIcon trend={item.trend} />
            <span>{item.trendText ?? item.hint ?? 'Live'}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

function StatsBlock({ items }: { items: Extract<AiResponseBlock, { type: 'stats' }>['items'] }) {
  return (
    <div
      className={cn(
        'grid gap-2',
        items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2',
      )}
    >
      {items.map((item, idx) => (
        <Card
          key={`${item.label}-${idx}`}
          className="border-border/50 bg-gradient-to-b from-muted/20 to-card p-3 shadow-none"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums leading-none tracking-tight text-foreground">
            {item.value}
          </p>
          {item.hint || item.trendText ? (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendIcon trend={item.trend} />
              <span className="line-clamp-2">{item.trendText ?? item.hint}</span>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

function progressTone(pct: number) {
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function progressBarClass(pct: number) {
  if (pct >= 80) return '[&>div]:bg-emerald-500'
  if (pct >= 50) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-rose-500'
}

function ProgressBlock({
  label,
  value,
  max = 100,
  suffix,
  format,
  detail,
}: Extract<AiResponseBlock, { type: 'progress' }>) {
  const { pct, display } = normalizeProgressValue(value, max, format)
  return (
    <Card className="border-border/50 bg-muted/20 p-3 shadow-none">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {detail ? <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p> : null}
        </div>
        <p className={cn('text-sm font-bold tabular-nums', progressTone(pct))}>
          {suffix ? `${value}${suffix}` : display}
        </p>
      </div>
      <Progress value={pct} className={cn('h-2.5', progressBarClass(pct))} />
    </Card>
  )
}

function BarChartBlock({
  title,
  items,
}: Extract<AiResponseBlock, { type: 'bar_chart' }>) {
  const data = items.map((item) => ({ name: item.label, value: item.value }))
  return (
    <Card className="border-border/50 bg-muted/15 p-3 shadow-none">
      {title ? <p className="mb-2 text-xs font-semibold text-foreground">{title}</p> : null}
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={42}
            />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              cursor={{ fill: 'var(--color-muted)', opacity: 0.35 }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-card)',
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function DonutBlock({ title, items }: Extract<AiResponseBlock, { type: 'donut' }>) {
  const data = items.map((item) => ({ name: item.label, value: item.value }))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <Card className="border-border/50 bg-muted/15 p-3 shadow-none">
      {title ? <p className="mb-2 text-xs font-semibold text-foreground">{title}</p> : null}
      <div className="flex items-center gap-3">
        <div className="h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={28}
                outerRadius={48}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="truncate text-muted-foreground">{d.name}</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function AlertBlock({
  severity,
  title,
  body,
}: Extract<AiResponseBlock, { type: 'alert' }>) {
  const styles =
    severity === 'high'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-100'
      : severity === 'medium'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'

  return (
    <div className={cn('rounded-xl border px-3 py-2.5', styles)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {body ? <p className="mt-1 text-xs leading-relaxed opacity-90">{body}</p> : null}
        </div>
      </div>
    </div>
  )
}

function BulletsBlock({
  title,
  items,
}: Extract<AiResponseBlock, { type: 'bullets' }>) {
  return (
    <Card className="border-border/50 bg-muted/15 p-3 shadow-none">
      {title ? <p className="mb-2 text-xs font-semibold text-foreground">{title}</p> : null}
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/90">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{renderInlineMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function BlockRenderer({ block }: { block: AiResponseBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 3 ? (
        <h4 className="text-sm font-semibold text-foreground">{block.text}</h4>
      ) : (
        <h3 className="text-base font-bold tracking-tight text-foreground">{block.text}</h3>
      )
    case 'text':
      return (
        <p className="text-sm leading-relaxed text-foreground/90">{renderInlineMarkdown(block.text)}</p>
      )
    case 'stats':
      return <StatsBlock items={block.items} />
    case 'progress':
      return <ProgressBlock {...block} />
    case 'bar_chart':
      return <BarChartBlock {...block} />
    case 'donut':
      return <DonutBlock {...block} />
    case 'alert':
      return <AlertBlock {...block} />
    case 'bullets':
      return <BulletsBlock {...block} />
    default:
      return null
  }
}

export function AiMessageRenderer({
  structured,
  highlights,
  showHighlights = true,
}: {
  structured: AiStructuredResponse
  highlights?: AiContextHighlight[]
  showHighlights?: boolean
}) {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            GELOS AI
          </p>
          {structured.title ? (
            <p className="truncate text-sm font-bold text-foreground">{structured.title}</p>
          ) : null}
        </div>
        <Badge variant="outline" className="ml-auto text-[10px]">
          Live data
        </Badge>
      </div>

      {structured.summary ? (
        <Card className="border-primary/15 bg-primary/5 p-3 shadow-none">
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {renderInlineMarkdown(structured.summary)}
          </p>
        </Card>
      ) : null}

      {showHighlights && highlights && highlights.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Snapshot
          </p>
          <HighlightGrid items={highlights} />
        </div>
      ) : null}

      <div className="space-y-3">
        {structured.blocks.map((block, i) => {
          const sectionLabel =
            block.type === 'stats'
              ? 'Key metrics'
              : block.type === 'progress'
                ? 'Performance'
                : block.type === 'alert'
                  ? 'Attention'
                  : block.type === 'bullets'
                    ? block.title ?? 'Next steps'
                    : null

          return (
            <div key={i} className="space-y-2">
              {sectionLabel && block.type !== 'bullets' ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {sectionLabel}
                </p>
              ) : null}
              <BlockRenderer block={block} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AiMessageSkeleton() {
  return (
    <div className="w-full space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-muted" />
        <div className="h-4 w-28 rounded bg-muted" />
      </div>
      <div className="h-16 rounded-xl bg-muted/80" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-20 rounded-xl bg-muted/70" />
        <div className="h-20 rounded-xl bg-muted/70" />
      </div>
      <div className="h-32 rounded-xl bg-muted/60" />
      <div className="h-24 rounded-xl bg-muted/50" />
    </div>
  )
}
