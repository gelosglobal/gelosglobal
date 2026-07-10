import type { ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'

type SfPageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
}

export function SfPageHeader({ title, description, actions }: SfPageHeaderProps) {
  return (
    <PageHeader eyebrow="Retail" title={title} description={description} actions={actions} />
  )
}
