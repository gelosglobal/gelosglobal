'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { MapPin, Clock, AlertCircle, CheckCircle2, Phone, MapPinIcon, ShoppingCart, Package } from 'lucide-react'

const repData = {
  profile: {
    name: 'John Mensah',
    region: 'Accra Central',
    phone: '+233 24 123 4567',
    visitsToday: 8,
    visitsTarget: 10,
    revenue: 1200,
    orders: 4
  },
  outlets: [
    { id: 1, name: 'Elite Pharmacy', type: 'Pharmacy', status: 'active', distance: '2.3 km', lastVisit: '2 hours ago', contact: 'Mr. Owusu' },
    { id: 2, name: 'Accra Medical Centre', type: 'Supermarket', status: 'active', distance: '1.8 km', lastVisit: '4 hours ago', contact: 'Ms. Osei' },
    { id: 3, name: 'Community Pharmacy', type: 'Pharmacy', status: 'prospect', distance: '3.1 km', lastVisit: 'Never', contact: 'Mr. Mensah' },
    { id: 4, name: 'Downtown Kiosk', type: 'Kiosk', status: 'inactive', distance: '2.9 km', lastVisit: '1 week ago', contact: 'Ms. Boateng' },
    { id: 5, name: 'Wholesale Hub', type: 'Wholesaler', status: 'active', distance: '4.2 km', lastVisit: 'Today', contact: 'Mr. Amponsah' }
  ],
  dailyVisits: [
    { time: '08:00', completed: 1 },
    { time: '09:00', completed: 1 },
    { time: '10:00', completed: 1 },
    { time: '11:00', completed: 1 },
    { time: '12:00', completed: 1 },
    { time: '13:00', completed: 1 },
    { time: '14:00', completed: 1 },
    { time: '15:00', completed: 1 }
  ],
  inventory: [
    { product: 'Vitamin C 500mg', quantity: 45, unit: 'boxes' },
    { product: 'Pain Relief Gel', quantity: 28, unit: 'units' },
    { product: 'Multivitamin', quantity: 32, unit: 'bottles' },
    { product: 'Cough Syrup', quantity: 15, unit: 'bottles' },
    { product: 'First Aid Kit', quantity: 8, unit: 'kits' }
  ],
  recentOrders: [
    { id: 'ORD001', outlet: 'Elite Pharmacy', amount: 320, time: '10:30 AM', items: 4 },
    { id: 'ORD002', outlet: 'Wholesale Hub', amount: 450, time: '9:15 AM', items: 6 },
    { id: 'ORD003', outlet: 'Accra Medical Centre', amount: 280, time: '8:45 AM', items: 3 }
  ]
}

export function RepView() {
  const [selectedTab, setSelectedTab] = useState('dashboard')
  const [selectedOutlet, setSelectedOutlet] = useState<typeof repData.outlets[0] | null>(null)

  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-lg p-6 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{repData.profile.name}</h1>
            <p className="text-white/90 flex items-center gap-2 mt-2">
              <MapPin className="h-4 w-4" />
              {repData.profile.region}
            </p>
          </div>
          <Button variant="outline" className="border-white text-white hover:bg-white/20">
            <Phone className="h-4 w-4 mr-2" />
            {repData.profile.phone}
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="bg-white/20 rounded p-3">
            <p className="text-white/80 text-sm">Visits Today</p>
            <p className="text-2xl font-bold text-white">{repData.profile.visitsToday}/{repData.profile.visitsTarget}</p>
          </div>
          <div className="bg-white/20 rounded p-3">
            <p className="text-white/80 text-sm">Revenue</p>
            <p className="text-2xl font-bold text-white">₵{repData.profile.revenue}</p>
          </div>
          <div className="bg-white/20 rounded p-3">
            <p className="text-white/80 text-sm">Orders</p>
            <p className="text-2xl font-bold text-white">{repData.profile.orders}</p>
          </div>
          <div className="bg-white/20 rounded p-3">
            <p className="text-white/80 text-sm">On Track</p>
            <p className="text-2xl font-bold text-white">80%</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          {/* Today's Performance */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Visit Timeline</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={repData.dailyVisits}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" stroke="var(--color-muted-foreground)" />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }} />
                <Bar dataKey="completed" fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Next Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Next Actions
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-semibold text-foreground">Community Pharmacy</p>
                  <p className="text-sm text-muted-foreground">Follow up on new outlet (3.1 km away)</p>
                </div>
                <Badge>Prospect</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-semibold text-foreground">Downtown Kiosk</p>
                  <p className="text-sm text-muted-foreground">Check stock status (Inactive)</p>
                </div>
                <Badge variant="secondary">Low Priority</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-semibold text-foreground">Elite Pharmacy</p>
                  <p className="text-sm text-muted-foreground">Restock display materials (POSM)</p>
                </div>
                <Badge variant="outline">In Progress</Badge>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Outlets Tab */}
        <TabsContent value="outlets" className="space-y-4 mt-4">
          <div className="space-y-3">
            {repData.outlets.map(outlet => (
              <Card 
                key={outlet.id} 
                className={`p-4 cursor-pointer transition hover:shadow-md border-2 ${
                  selectedOutlet?.id === outlet.id ? 'border-primary' : 'border-border'
                }`}
                onClick={() => setSelectedOutlet(outlet)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-foreground">{outlet.name}</h4>
                      <Badge variant="outline" className="text-xs">{outlet.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPinIcon className="h-4 w-4" />
                      {outlet.distance}
                    </p>
                  </div>
                  <Badge className={`${
                    outlet.status === 'active' ? 'bg-green-600' :
                    outlet.status === 'prospect' ? 'bg-blue-600' :
                    'bg-gray-600'
                  }`}>
                    {outlet.status.charAt(0).toUpperCase() + outlet.status.slice(1)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="text-sm font-semibold text-foreground">{outlet.contact}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Last Visit</p>
                    <p className="text-sm font-semibold text-foreground">{outlet.lastVisit}</p>
                  </div>
                </div>

                {selectedOutlet?.id === outlet.id && (
                  <div className="mt-4 pt-4 border-t border-primary space-y-2">
                    <Button className="w-full" size="sm">
                      <MapPinIcon className="h-4 w-4 mr-2" />
                      Check In
                    </Button>
                    <Button variant="outline" className="w-full" size="sm">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Create Order
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Stock Level</h3>
            <div className="space-y-4">
              {repData.inventory.map((item, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-foreground text-sm">{item.product}</p>
                    <p className="text-sm text-muted-foreground">{item.quantity} {item.unit}</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full rounded-full transition" 
                      style={{ width: `${Math.min(item.quantity / 50 * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-yellow-500 bg-yellow-50/50">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Low Stock Alert</p>
                <p className="text-sm text-muted-foreground mt-1">Cough Syrup is running low (15 units). Request restock from warehouse.</p>
                <Button variant="outline" size="sm" className="mt-3">Request Restock</Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          <div className="flex gap-2 mb-4">
            <Button className="flex-1" size="lg">
              <ShoppingCart className="h-5 w-5 mr-2" />
              New Order
            </Button>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Today&apos;s Orders</h3>
            <div className="space-y-3">
              {repData.recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                  <div>
                    <p className="font-semibold text-foreground">{order.outlet}</p>
                    <p className="text-sm text-muted-foreground">{order.id} • {order.items} items</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">₵{order.amount}</p>
                    <p className="text-xs text-muted-foreground">{order.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 bg-primary/5 border-primary">
            <p className="text-sm font-semibold text-foreground">Total Orders Today</p>
            <p className="text-3xl font-bold text-primary mt-2">₵{repData.recentOrders.reduce((sum, o) => sum + o.amount, 0)}</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
