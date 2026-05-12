import { SfInventoryView } from '@/components/sf/sf-inventory-view'

export default function DtcWholesaleInventoryPage() {
  return (
    <SfInventoryView
      readOnly={false}
      headerKind="dtc"
      pageTitle="Wholesale Inventory"
      pageDescription="Edit shared retail stock (same database as Sales Force → Retail Inventory). The retail team currently has view-only access there."
      stockTableTitle="Wholesale stock (shared with retail)"
      exportFilePrefix="dtc-wholesale-inventory"
      loadErrorMessage="Could not load wholesale inventory"
    />
  )
}
