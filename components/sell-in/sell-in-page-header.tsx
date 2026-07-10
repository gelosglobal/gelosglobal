import type { ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'

type SellInPageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
}

export function SellInPageHeader({ title, description, actions }: SellInPageHeaderProps) {
  return (
    <PageHeader eyebrow="Sell-in" title={title} description={description} actions={actions} />
  )
}
