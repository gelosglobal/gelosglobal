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

export const salesForceNavItems: NavItemConfig[] = [
  { label: 'SF Dashboard', href: '/sf/dashboard', icon: Home },
  { label: 'Outlet Scouting', href: '/sf/outlet-scouting', icon: Map },
  { label: 'Shop Visits', href: '/sf/shop-visits', icon: Store },
  { label: 'POSM Tracker', href: '/sf/posm-tracker', icon: Activity },
  { label: 'SF Inventory', icon: Box },
  { label: 'B2B Payments', href: '/sf/b2b-payments', icon: CreditCard },
  { label: 'Targets & Quotas', icon: Target },
  { label: 'Rep Leaderboard', icon: BarChart3 },
  { label: 'SF Reports', icon: BarChart3 },
  { label: 'Outlet Scout Map', href: '/sf/outlet-scout-map', icon: MapPin },
]

const pathTitleEntries: [string, string][] = [
  ['/sf/dashboard', 'SF Dashboard'],
  ['/sf/outlet-scouting', 'Outlet Scouting'],
  ['/sf/shop-visits', 'Shop Visits'],
  ['/sf/posm-tracker', 'POSM Tracker'],
  ['/sf/b2b-payments', 'B2B Payments'],
  ['/sf/outlet-scout-map', 'Outlet Scout Map'],
  ['/sf', 'Sales Force'],
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
  if (pathname.startsWith('/sf/')) return 'Sales Force'
  if (pathname === '/') return 'Master Dashboard'
  return 'GELOS'
}
