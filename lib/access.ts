import type { Session } from 'better-auth'

export type AppSection = 'master' | 'dtc' | 'retail' | 'sell-in'

export type UserAccess = {
  email: string | null
  sections: Set<AppSection>
  homePath: string
}

function normalizeEmail(v: unknown): string | null {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return e && e.includes('@') ? e : null
}

// Email-based access rules.
// Any email not listed here defaults to full access.
const EMAIL_SECTION_RULES: Record<string, AppSection[]> = {
  // Retail-only users
  'baaba@gelosglobal.com': ['retail'],
  'desmond@gelosglobal.com': ['retail'],

  // DTC-only users
  'precious@gelosglobal.com': ['dtc'],

  // Master (admin) users — master implies full access (see below)
  'cassie@gelosglobal.com': ['master'],
  'michael@gelosglobal.com': ['master'],
}

export function getUserAccess(session: Session | null): UserAccess {
  const email = normalizeEmail((session as any)?.user?.email)

  const defaultSections: AppSection[] = ['master', 'dtc', 'retail', 'sell-in']
  const rule = email ? EMAIL_SECTION_RULES[email] : undefined
  const sections = new Set<AppSection>(rule ?? defaultSections)

  // Master users can access everything (master implies admin-style access).
  if (sections.has('master')) {
    for (const s of defaultSections) sections.add(s)
  }

  const homePath = sections.has('master')
    ? '/'
    : sections.has('retail')
      ? '/sf/dashboard'
      : sections.has('dtc')
        ? '/dtc/dashboard'
        : sections.has('sell-in')
          ? '/sell-in'
          : '/sign-in'

  return { email, sections, homePath }
}

export function canAccessPath(access: UserAccess, pathname: string): boolean {
  if (pathname === '/') return access.sections.has('master')
  if (pathname.startsWith('/dtc')) return access.sections.has('dtc')
  if (pathname.startsWith('/sf')) return access.sections.has('retail')
  if (pathname.startsWith('/sell-in')) return access.sections.has('sell-in')
  return true
}

