'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp } from 'lucide-react'

const dashboardData = {
  kpis: [
    { label: 'Total Revenue', value: 'GHS 13,154', subtitle: 'DTC + B2B', color: 'border-blue-600' },
    { label: 'DTC Revenue', value: 'GHS 254', subtitle: 'sell-out', color: 'border-purple-600' },
    { label: 'B2B Collected', value: 'GHS 12,900', subtitle: 'Trade channels', color: 'border-green-600' },
    { label: 'B2B Outstanding', value: 'GHS 8,500', subtitle: '1 overdue', color: 'border-red-600' },
    { label: 'ROAS', value: '0.12x', subtitle: 'on mktg spend', color: 'border-teal-600' },
    { label: 'SF Contribution', value: '98%', subtitle: 'of total revenue', color: 'border-indigo-600' }
  ],
  revenueData: [
    { channel: 'DTC', percentage: 2, fill: '#7c3aed' },
    { channel: 'SF', percentage: 98, fill: '#2563eb' }
  ],
  alerts: [
    { id: 1, icon: 'stock', text: '[DTC] Low Stock: Gelos Charcoal Toothpaste — 25 units · 14d remaining' },
    { id: 2, icon: 'stock', text: '[DTC] Low Stock: Gelos Flosser — 19 units · 14d remaining' },
    { id: 3, icon: 'stock', text: '[DTC] Low Stock: Gelos Whitening Kit — 11 units · 12d remaining' },
    { id: 4, icon: 'stock', text: '[SF] Low Stock: Gelos Gold 1L — 80 Cases' },
    { id: 5, icon: 'stock', text: '[SF] Low Stock: Gelos Fresh 250ml — 15 Cases' },
    { id: 6, icon: 'stock', text: '[SF] Low Stock: Gelos Lite 330ml — 45 Cases' },
    { id: 7, icon: 'payment', text: '[B2B] Overdue: Kwame Stores · INV-002 · GHS 2,200' }
  ],
  recentOrders: [
    { id: 'ORD-001', store: 'Elite Pharmacy', amount: 'GHS 450', time: '2 hours ago' },
    { id: 'ORD-002', store: 'Kwame Supermarket', amount: 'GHS 1,200', time: '4 hours ago' }
  ],
  recentVisits: [
    { id: 'VST-001', outlet: 'Accra Mall', rep: 'John Mensah', time: '1 hour ago' },
    { id: 'VST-002', outlet: 'Marina Stores', rep: 'Ama Osei', time: '2 hours ago' }
  ]
}

export function ManagerDashboard() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Master Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Command Center</p>
        </div>
        <p className="text-sm text-muted-foreground">10 Apr 2026</p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboardData.kpis.map((kpi, idx) => (
            <Card key={idx} className={`p-6 border-l-4 ${kpi.color} border-r-0 border-t-0 border-b-0`}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
              <p className="text-3xl font-bold text-foreground mt-2">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-2">{kpi.subtitle}</p>
            </Card>
          ))}
        </div>

        {/* Revenue Split */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-6">Revenue Split — DTC vs Sales Force</h3>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={dashboardData.revenueData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <XAxis type="number" hide={true} domain={[0, 100]} />
              <Bar dataKey="percentage" fill="#2563eb" radius={[0, 4, 4, 0]} />
              <Tooltip 
                formatter={(value) => `${value}%`}
                contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '6px' }}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-600 rounded-sm"></div>
              <span>DTC 2%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
              <span>SF 98%</span>
            </div>
          </div>
        </Card>

        {/* Alerts Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Alerts</h3>
          </div>
          <div className="space-y-2">
            {dashboardData.alerts.map((alert) => (
              <Card key={alert.id} className="p-4 border-l-4 border-l-red-600 border-r-0 border-t-0 border-b-0">
                <p className="text-sm text-foreground">{alert.text}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent DTC Orders */}
          <Card className="p-6 border-l-4 border-l-purple-600 border-r-0 border-t-0 border-b-0">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest mb-4">Recent DTC Orders</h3>
            <div className="space-y-3">
              {dashboardData.recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between pb-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-foreground text-sm">{order.store}</p>
                    <p className="text-xs text-muted-foreground">{order.time}</p>
                  </div>
                  <p className="font-semibold text-foreground">{order.amount}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent B2B Visits */}
          <Card className="p-6 border-l-4 border-l-blue-600 border-r-0 border-t-0 border-b-0">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest mb-4">Recent B2B Visits</h3>
            <div className="space-y-3">
              {dashboardData.recentVisits.map((visit) => (
                <div key={visit.id} className="flex items-center justify-between pb-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-foreground text-sm">{visit.outlet}</p>
                    <p className="text-xs text-muted-foreground">{visit.rep}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{visit.time}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
