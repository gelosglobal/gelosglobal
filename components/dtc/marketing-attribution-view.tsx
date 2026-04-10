'use client'

import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const channelSpend = [
  { channel: 'Meta', spend: 4200, attributed: 12400 },
  { channel: 'TikTok', spend: 2800, attributed: 8100 },
  { channel: 'Google', spend: 3100, attributed: 9800 },
  { channel: 'Influencer', spend: 1500, attributed: 6200 },
]

export function MarketingAttributionView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Marketing Attribution"
        description="Tie ad spend to DTC revenue and blended ROAS. Use channel mix to optimise sell-out campaigns."
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Blended ROAS</p>
            <p className="mt-2 text-3xl font-bold">3.2x</p>
            <p className="mt-1 text-xs text-muted-foreground">Last 30 days · DTC only</p>
          </Card>
          <Card className="p-5 lg:col-span-2">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Spend vs attributed revenue
            </p>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelSpend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `GHS ${v / 1000}k`} />
                  <Tooltip
                    formatter={(value: number) => [`GHS ${value.toLocaleString()}`, '']}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="spend" name="Spend" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="attributed"
                    name="Attributed revenue"
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
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Channel summary</h2>
          </div>
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
              {channelSpend.map((c) => (
                <TableRow key={c.channel}>
                  <TableCell className="font-medium">{c.channel}</TableCell>
                  <TableCell className="text-right">GHS {c.spend.toLocaleString()}</TableCell>
                  <TableCell className="text-right">GHS {c.attributed.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(c.attributed / c.spend).toFixed(1)}x
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
