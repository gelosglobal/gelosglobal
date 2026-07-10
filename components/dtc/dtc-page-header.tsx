import type { ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'

type DtcPageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
}

export function DtcPageHeader({ title, description, actions }: DtcPageHeaderProps) {
  return (
    <PageHeader
      eyebrow="DTC / Sell-out"
      title={title}
      description={description}
      actions={actions}
    />
  )
}
