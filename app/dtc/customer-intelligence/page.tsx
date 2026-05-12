import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DtcCustomerIntelligenceSummaryView } from '@/components/dtc/dtc-customer-intelligence-summary-view'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Button } from '@/components/ui/button'

const CUSTOMER_INTELLIGENCE_DESCRIPTION =
  ''

export default function CustomerIntelligencePage() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Customer Intelligence"
        description={CUSTOMER_INTELLIGENCE_DESCRIPTION}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/dtc/orders-engine">
              Orders Engine
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <DtcCustomerIntelligenceSummaryView />
    </div>
  )
}
