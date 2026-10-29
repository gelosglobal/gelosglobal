import type { AppSection } from '@/lib/access'
import { escapeHtml } from '@/lib/mcp/http'

const SECTION_COPY: Record<AppSection, string> = {
  master: 'Master admin',
  dtc: 'DTC orders, inventory, and finance',
  retail: 'Retail outlets, invoices, visits, and targets',
  'sell-in': 'Sell-in expenses',
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, sans-serif; background: #f4f4f5; color: #18181b; }
    main { width: min(440px, calc(100% - 32px)); background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,.06); }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { margin: 0 0 14px; line-height: 1.45; color: #3f3f46; }
    ul { margin: 0 0 18px; padding-left: 18px; color: #3f3f46; }
    .row { display: flex; gap: 10px; }
    button { flex: 1; height: 44px; border-radius: 10px; font-weight: 650; cursor: pointer; }
    .allow { border: 0; background: #18181b; color: #fff; }
    .deny { border: 1px solid #d4d4d8; background: transparent; color: inherit; }
    @media (prefers-color-scheme: dark) {
      body { background: #09090b; color: #fafafa; }
      main { background: #18181b; border-color: #27272a; }
      p, ul { color: #d4d4d8; }
      .allow { background: #fafafa; color: #18181b; }
      .deny { border-color: #3f3f46; }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`
}

export function oauthErrorPage(message: string): string {
  return page(
    'GELOS connection',
    `<h1>Can’t connect</h1><p>${escapeHtml(message)}</p>`,
  )
}

export function oauthConsentPage(input: {
  clientName: string
  redirectHost: string
  email: string
  sections: AppSection[]
  fields: Record<string, string>
  formAction: string
}): string {
  const hidden = Object.entries(input.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join('')
  const sections = input.sections
    .map((section) => `<li>${escapeHtml(SECTION_COPY[section])}</li>`)
    .join('')
  return page(
    'Connect to GELOS',
    `<h1>Connect ${escapeHtml(input.clientName)}</h1>
    <p><strong>${escapeHtml(input.email)}</strong> is about to give ${escapeHtml(input.clientName)} read-only access to GELOS. Nothing can be created, edited, or deleted.</p>
    <ul>${sections}</ul>
    <p>After you allow it, you’ll return to ${escapeHtml(input.redirectHost)}.</p>
    <form method="post" action="${escapeHtml(input.formAction)}">
      ${hidden}
      <div class="row">
        <button class="deny" type="submit" name="decision" value="deny">Cancel</button>
        <button class="allow" type="submit" name="decision" value="allow">Allow</button>
      </div>
    </form>`,
  )
}
