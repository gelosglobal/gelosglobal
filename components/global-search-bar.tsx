'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Command as CommandPrimitive } from 'cmdk'
import { Sparkles } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { getUserAccess } from '@/lib/access'
import { getSearchablePages } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useAiAssistant } from '@/components/ai-assistant'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type SearchMode = 'search' | 'ai'

const AI_SUGGESTIONS = [
  'What needs attention today?',
  'Summarize retail performance this week',
  'Which SKUs are below safety stock?',
  'How are we tracking against the monthly target?',
] as const

type GlobalSearchBarProps = {
  className?: string
}

export function GlobalSearchBar({ className }: GlobalSearchBarProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const { openWithPrompt, setOpen: openAiPanel } = useAiAssistant()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<SearchMode>('search')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const aiMode = mode === 'ai'

  const pages = useMemo(() => {
    const access = getUserAccess((session as any) ?? null)
    return getSearchablePages(access.sections)
  }, [session])

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pages
    return pages.filter((p) => {
      const hay = [p.label, p.section, p.href, ...p.keywords].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [pages, query])

  const openPalette = useCallback((nextMode: SearchMode = 'search') => {
    setMode(nextMode)
    setQuery('')
    setOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setMode('search')
  }, [])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette('ai')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPalette])

  function navigate(href: string) {
    closePalette()
    router.push(href)
  }

  function askAi(prompt?: string) {
    const text = (prompt ?? query).trim()
    closePalette()
    if (text) openWithPrompt(text)
    else openAiPanel(true)
  }

  function switchToAiMode() {
    setMode('ai')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    if (aiMode) {
      e.preventDefault()
      askAi(query)
    }
  }

  return (
    <>
      <div
        className={cn(
          'relative flex h-9 w-full items-center rounded-full border border-border/70 bg-muted/40 text-sm shadow-none transition-colors dark:border-border/40 dark:bg-muted/55',
          className,
        )}
      >
        <button
          type="button"
          onClick={() => openPalette('ai')}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-l-full pl-3 pr-2 text-primary transition-colors hover:bg-muted/60 dark:hover:bg-muted/70"
          aria-label="Ask GELOS AI"
        >
          <Sparkles className="h-4 w-4" />
          <kbd className="pointer-events-none hidden rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => openPalette('search')}
          className="flex h-full min-w-0 flex-1 items-center pr-3 text-left transition-colors hover:bg-muted/60 dark:hover:bg-muted/70"
          aria-label="Search pages"
        >
          <span className="truncate text-muted-foreground">
            Search pages, orders, outlets…
          </span>
        </button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closePalette()
          else setOpen(true)
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton>
          <DialogHeader className="sr-only">
            <DialogTitle>{aiMode ? 'Ask GELOS AI' : 'Search GELOS'}</DialogTitle>
            <DialogDescription>
              {aiMode ? 'Ask questions about your business data' : 'Jump to a page or ask GELOS AI'}
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <div className="flex h-12 items-center gap-2 border-b px-3">
              <button
                type="button"
                onClick={() => (aiMode ? setMode('search') : switchToAiMode())}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors',
                  aiMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
                aria-label={aiMode ? 'Switch to page search' : 'Switch to AI mode'}
                title={aiMode ? 'Page search' : 'AI mode'}
              >
                <Sparkles className="h-4 w-4" />
                {aiMode ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide">AI</span>
                ) : null}
              </button>
              <CommandPrimitive.Input
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  aiMode
                    ? 'Ask GELOS AI anything about your business…'
                    : 'Search pages, orders, outlets…'
                }
                className="placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none"
              />
            </div>
            <CommandList className="max-h-[min(60vh,22rem)]">
              {aiMode ? (
                <>
                  <CommandGroup heading="GELOS AI">
                    <CommandItem value="ask-ai" onSelect={() => askAi(query)} className="gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {query.trim() ? (
                        <span>
                          Ask GELOS AI:{' '}
                          <span className="text-muted-foreground">&quot;{query.trim()}&quot;</span>
                        </span>
                      ) : (
                        <span>Open GELOS AI assistant</span>
                      )}
                    </CommandItem>
                  </CommandGroup>

                  {!query.trim() ? (
                    <CommandGroup heading="Suggestions">
                      {AI_SUGGESTIONS.map((prompt) => (
                        <CommandItem
                          key={prompt}
                          value={`suggestion-${prompt}`}
                          onSelect={() => askAi(prompt)}
                          className="gap-2"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                          <span>{prompt}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </>
              ) : (
                <>
                  <CommandEmpty>No pages found.</CommandEmpty>

                  {filteredPages.length > 0 ? (
                    <CommandGroup heading="Pages">
                      {filteredPages.map((page) => (
                        <CommandItem
                          key={page.href}
                          value={page.href}
                          onSelect={() => navigate(page.href)}
                        >
                          <span className="font-medium">{page.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{page.section}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}

                  <CommandSeparator />

                  <CommandGroup heading="GELOS AI">
                    <CommandItem
                      value="ask-ai-search"
                      onSelect={() => (query.trim() ? askAi(query) : switchToAiMode())}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                      {query.trim() ? (
                        <span>
                          Ask GELOS AI:{' '}
                          <span className="text-muted-foreground">&quot;{query.trim()}&quot;</span>
                        </span>
                      ) : (
                        <span>Switch to AI mode</span>
                      )}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
