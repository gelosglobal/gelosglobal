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
  Wallet,
  Users,
} from 'lucide-react'

export type NavItemConfig = {
  label: string
  href?: string
  icon: LucideIcon
  /** Optional indentation level for "submenu" items. */
  indent?: 0 | 1
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
]

export const sellInNavItems: NavItemConfig[] = [
  { label: 'Sell-in', href: '/sell-in', icon: TrendingUp },
  { label: 'Expenses', href: '/sell-in/expenses', icon: Wallet },
]

export const salesForceNavItems: NavItemConfig[] = [
  { label: 'Retail Dashboard', href: '/sf/dashboard', icon: Home },
  { label: 'Outlet Scouting', href: '/sf/outlet-scouting', icon: Map },
  { label: 'Shop Visits', href: '/sf/shop-visits', icon: Store },
  { label: 'POSM Tracker', href: '/sf/posm-tracker', icon: Activity },
  { label: 'Retail Inventory', href: '/sf/inventory', icon: Box },
  { label: 'B2B Payments', href: '/sf/b2b-payments', icon: CreditCard },
  { label: 'Invoices', href: '/sf/b2b-invoices', icon: CreditCard, indent: 1 },
  { label: 'Customer Intelligence', href: '/sf/customer-intelligence', icon: Users },
  { label: 'Targets & Quotas', href: '/sf/targets', icon: Target },
  { label: 'Rep Leaderboard', href: '/sf/leaderboard', icon: BarChart3 },
  { label: 'Retail Reports', href: '/sf/reports', icon: BarChart3 },
  { label: 'Outlet Scout Map', href: '/sf/outlet-scout-map', icon: MapPin },
]

const pathTitleEntries: [string, string][] = [
  ['/sell-in', 'Sell-in'],
  ['/sell-in/expenses', 'Expenses'],
  ['/sf/dashboard', 'Retail Dashboard'],
  ['/sf/outlet-scouting', 'Outlet Scouting'],
  ['/sf/shop-visits', 'Shop Visits'],
  ['/sf/posm-tracker', 'POSM Tracker'],
  ['/sf/inventory', 'Retail Inventory'],
  ['/sf/b2b-payments', 'B2B Payments'],
  ['/sf/b2b-invoices', 'Invoices'],
  ['/sf/customer-intelligence', 'Customer Intelligence'],
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
