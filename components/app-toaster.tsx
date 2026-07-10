'use client'

import { Toaster } from 'sonner'
import { useTheme } from 'next-themes'

export function AppToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      richColors
      position="top-center"
      closeButton
      theme={(resolvedTheme as 'light' | 'dark' | undefined) ?? 'light'}
    />
  )
}
