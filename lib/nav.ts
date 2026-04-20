import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Box,
  CreditCard,
  Home,
  Landmark,
  Map,
  MapPin,
  Package,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

export type NavItemConfig = {
  label: string
  href?: string
  icon: LucideIcon
}

export const dtcNavItems: NavItemConfig[] = [
  { label: 'DTC Dashboard', href: '/dtc/dashboard', icon: Home },
  { label: 'Orders Engine', href: '/dtc/orders-engine', icon: ShoppingCart },
  {
    label: 'Customer Intelligence',
    href: '/dtc/customer-intelligence',
    icon: Users,
  },
  { label: 'DTC Inventory', href: '/dtc/inventory', icon: Package },
  {
    label: 'Product Performance',
    href: '/dtc/product-performance',
    icon: TrendingUp,
  },
  {
    label: 'Marketing Attribution',
    href: '/dtc/marketing-attribution',
    icon: BarChart3,
  },
  { label: 'Finance Layer', href: '/dtc/finance-layer', icon: Landmark },
]

export const sellInNavItems: NavItemConfig[] = [
  { label: 'Sell-in', href: '/sell-in', icon: TrendingUp },
]

export const salesForceNavItems: NavItemConfig[] = [
  { label: 'Retail Dashboard', href: '/sf/dashboard', icon: Home },
  { label: 'Outlet Scouting', href: '/sf/outlet-scouting', icon: Map },
  { label: 'Shop Visits', href: '/sf/shop-visits', icon: Store },
  { label: 'Orders Engine', href: '/sf/orders-engine', icon: ShoppingCart },
  { label: 'POSM Tracker', href: '/sf/posm-tracker', icon: Activity },
  { label: 'Retail Inventory', href: '/sf/inventory', icon: Box },
  { label: 'B2B Payments', href: '/sf/b2b-payments', icon: CreditCard },
  { label: 'Targets & Quotas', href: '/sf/targets', icon: Target },
  { label: 'Rep Leaderboard', href: '/sf/leaderboard', icon: BarChart3 },
  { label: 'Retail Reports', href: '/sf/reports', icon: BarChart3 },
  { label: 'Outlet Scout Map', href: '/sf/outlet-scout-map', icon: MapPin },
]

const pathTitleEntries: [string, string][] = [
  ['/sell-in', 'Sell-in'],
  ['/sf/dashboard', 'Retail Dashboard'],
  ['/sf/outlet-scouting', 'Outlet Scouting'],
  ['/sf/shop-visits', 'Shop Visits'],
  ['/sf/orders-engine', 'Orders Engine'],
  ['/sf/posm-tracker', 'POSM Tracker'],
  ['/sf/inventory', 'Retail Inventory'],
  ['/sf/b2b-payments', 'B2B Payments'],
  ['/sf/targets', 'Targets & Quotas'],
  ['/sf/leaderboard', 'Rep Leaderboard'],
  ['/sf/reports', 'Retail Reports'],
  ['/sf/outlet-scout-map', 'Outlet Scout Map'],
  ['/sf', 'Retail'],
  ['/dtc/dashboard', 'DTC Dashboard'],
  ['/dtc/orders-engine', 'Orders Engine'],
  ['/dtc/customer-intelligence', 'Customer Intelligence'],
  ['/dtc/inventory', 'DTC Inventory'],
  ['/dtc/product-performance', 'Product Performance'],
  ['/dtc/marketing-attribution', 'Marketing Attribution'],
  ['/dtc/finance-layer', 'Finance Layer'],
]

export function getMobileNavTitle(pathname: string): string {
  for (const [path, title] of pathTitleEntries) {
    if (pathname === path) return title
  }
  if (pathname.startsWith('/sell-in')) return 'Sell-in'
  if (pathname.startsWith('/sf/')) return 'Retail'
  if (pathname === '/') return 'Master Dashboard'
  return 'GELOS'
}
