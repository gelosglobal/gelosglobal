'use client'

import type { ReactNode } from 'react'
import { AuthBrandPanel, AuthLogoMark } from '@/components/auth/auth-brand-panel'
import { AuthPageBackdrop } from '@/components/auth/auth-page-backdrop'
import { ThemeToggle } from '@/components/theme-toggle'

type AuthShellProps = {
  children: ReactNode
  mode?: 'sign-in' | 'sign-up'
}

export function AuthShell({ children, mode = 'sign-in' }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AuthPageBackdrop />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <AuthBrandPanel mode={mode} />

        <div className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mb-6 w-full max-w-[440px] lg:hidden">
            <AuthLogoMark />
          </div>
          <div className="relative flex w-full justify-center">{children}</div>
        </div>
      </div>
    </div>
  )
}
