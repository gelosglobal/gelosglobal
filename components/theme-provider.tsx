'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: 'light' | 'dark' | 'system'
  forcedTheme?: 'light' | 'dark'
  enableSystem?: boolean
}

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  forcedTheme,
  enableSystem = !forcedTheme,
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      forcedTheme={forcedTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
