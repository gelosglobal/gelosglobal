import { SfInventoryView } from '@/components/sf/sf-inventory-view'

export default function DtcWholesaleInventoryPage() {
  return (
    <SfInventoryView
      readOnly={false}
      headerKind="dtc"
      pageTitle="Wholesale Inventory"
      pageDescription="Outlet-level wholesale stock shared with retail. Track on-hand, safety stock, reorder points, and days of cover."
      stockTableTitle="Wholesale stock (shared with retail)"
      exportFilePrefix="dtc-wholesale-inventory"
      loadErrorMessage="Could not load wholesale inventory"
    />
  )
}
