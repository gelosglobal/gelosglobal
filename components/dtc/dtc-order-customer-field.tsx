'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

type SearchHit = {
  id: string
  customerName: string
  phoneNumber: string
  location: string
  email: string
}

type Props = {
  id: string
  'aria-label'?: string
  value: string
  onChange: (next: string) => void
  required?: boolean
  placeholder?: string
}

export function DtcOrderCustomerField({
  id,
  'aria-label': ariaLabel,
  value,
  onChange,
  required,
  placeholder = 'Search by name, phone, email, location — or type a new name',
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [debounced, setDebounced] = useState(value)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchHit[]>([])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), 300)
    return () => window.clearTimeout(t)
  }, [value])

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([])
      return
    }
    setResults([])
    setLoading(true)
    try {
      const res = await fetch(
        `/api/dtc/customers/search?${new URLSearchParams({ q })}`,
        { credentials: 'include', cache: 'no-store' },
      )
      if (!res.ok) {
        setResults([])
        return
      }
      const data = (await res.json()) as { results: SearchHit[] }
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounced.length < 1) {
      setResults([])
      return
    }
    void runSearch(debounced)
  }, [debounced, runSearch])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const showList = open && (loading || results.length > 0) && debounced.length > 0

  return (
    <div>
      {ariaLabel ? <span className="sr-only">{ariaLabel}</span> : null}
      <div ref={rootRef} className="relative">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={id}
            className="pl-9"
            value={value}
            required={required}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-autocomplete="list"
            aria-controls={showList ? listId : undefined}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
          />
          {loading && (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          >
            {loading && results.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground">Searching…</li>
            ) : (
              results.map((r) => (
                <li
                  key={r.id}
                  role="option"
                  className="cursor-default px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(r.customerName)
                    setOpen(false)
                  }}
                >
                  <p className="font-medium text-foreground">{r.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {[(r.phoneNumber || '').trim(), (r.location || '').trim(), (r.email || '').trim()]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
        {open && !loading && debounced.length > 0 && results.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No match in Customer Intelligence. You can still use the name you typed.
          </p>
        )}
      </div>
    </div>
  )
}
