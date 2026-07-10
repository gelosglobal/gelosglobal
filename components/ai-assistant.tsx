'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { AiMessageRenderer, AiMessageSkeleton } from '@/components/ai/ai-message-renderer'
import type { AiContextHighlight, AiStructuredResponse } from '@/lib/ai-response'
import { cn } from '@/lib/utils'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  structured?: AiStructuredResponse
  highlights?: AiContextHighlight[]
}

type AiAssistantContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  openWithPrompt: (prompt: string) => void
  chatPrefill: string | null
  clearChatPrefill: () => void
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null)

const SUGGESTED_PROMPTS = [
  'What needs attention today?',
  'Summarize retail performance this week',
  'Which SKUs are below safety stock?',
  'How are we tracking against the monthly target?',
  'What are my open tasks?',
] as const

function newMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [chatPrefill, setChatPrefill] = useState<string | null>(null)

  const openWithPrompt = useCallback((prompt: string) => {
    setChatPrefill(prompt.trim())
    setOpen(true)
  }, [])

  const clearChatPrefill = useCallback(() => setChatPrefill(null), [])

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((v) => !v),
      openWithPrompt,
      chatPrefill,
      clearChatPrefill,
    }),
    [open, openWithPrompt, chatPrefill, clearChatPrefill],
  )

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>
}

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext)
  if (!ctx) {
    throw new Error('useAiAssistant must be used within AiAssistantProvider')
  }
  return ctx
}

export function AiAssistantTrigger({
  className,
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}: {
  className?: string
  variant?: 'outline' | 'default' | 'ghost'
  size?: 'sm' | 'icon' | 'default'
  showLabel?: boolean
}) {
  const { setOpen } = useAiAssistant()
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn('gap-1.5', className)}
      onClick={() => setOpen(true)}
      aria-label="Open GELOS AI"
    >
      <Sparkles className="h-4 w-4" />
      {showLabel && size !== 'icon' ? 'Ask AI' : null}
    </Button>
  )
}

export function AiAssistantPanel() {
  const pathname = usePathname()
  const { open, setOpen, chatPrefill, clearChatPrefill } = useAiAssistant()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && chatPrefill) {
      setInput(chatPrefill)
      clearChatPrefill()
    }
  }, [open, chatPrefill, clearChatPrefill])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMsg: ChatMessage = {
        id: newMessageId(),
        role: 'user',
        content: trimmed,
      }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)
      setInput('')
      setLoading(true)

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pathname,
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        })

        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: {
            role: 'assistant'
            content: string
            structured?: AiStructuredResponse
            highlights?: AiContextHighlight[]
          }
        }

        if (res.status === 401) {
          toast.error('Session expired. Sign in again.')
          return
        }
        if (!res.ok) {
          toast.error(data.error ?? 'AI request failed')
          return
        }

        if (data.message?.content) {
          setMessages((prev) => [
            ...prev,
            {
              id: newMessageId(),
              role: 'assistant',
              content: data.message!.content,
              structured: data.message!.structured,
              highlights: data.message!.highlights,
            },
          ])
        }
      } catch {
        toast.error('Could not reach GELOS AI')
      } finally {
        setLoading(false)
      }
    },
    [loading, messages, pathname],
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void sendMessage(input)
  }

  function clearChat() {
    setMessages([])
    setInput('')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border border-border/60 p-0 shadow-xl ring-1 ring-border/40 sm:max-w-xl top-3 right-3 bottom-3 h-auto max-h-[calc(100vh-1.5rem)] rounded-2xl dark:border-border/35 dark:ring-border/25"
      >
        <SheetHeader className="rounded-t-2xl border-b border-border/60 bg-card/90 px-4 py-4 text-left backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                GELOS AI
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs">
                Answers from live dashboard data — DTC, retail, inventory, finance, and your tasks.
              </SheetDescription>
            </div>
            {messages.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={clearChat}
                aria-label="Clear chat"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask about revenue, visits, inventory health, B2B collections, alerts, or what to
                  prioritize.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto whitespace-normal px-3 py-2 text-left text-xs leading-snug"
                      onClick={() => void sendMessage(prompt)}
                      disabled={loading}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => {
                const firstAssistantIdx = messages.findIndex((x) => x.role === 'assistant')
                return (
                  <div
                    key={m.id}
                    className={cn(
                      m.role === 'user'
                        ? 'ml-auto max-w-[88%] rounded-2xl bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground'
                        : 'w-full rounded-2xl border border-border/50 bg-card/80 p-3.5 shadow-sm',
                    )}
                  >
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : m.structured ? (
                      <AiMessageRenderer
                        structured={m.structured}
                        highlights={m.highlights}
                        showHighlights={idx === firstAssistantIdx}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {m.content}
                      </p>
                    )}
                  </div>
                )
              })
            )}
            {loading ? <AiMessageSkeleton /> : null}
          </div>
        </ScrollArea>

        <form
          onSubmit={handleSubmit}
          className="rounded-b-2xl border-t border-border/60 bg-card/90 p-4 backdrop-blur-sm"
        >
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about dashboards, inventory, targets…"
              className="min-h-[44px] max-h-32 resize-none text-sm"
              rows={2}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage(input)
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 self-end"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Powered by Groq · Read-only insights from your permitted modules
          </p>
        </form>
      </SheetContent>
    </Sheet>
  )
}
