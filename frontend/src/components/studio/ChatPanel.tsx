'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, type RefObject } from 'react'
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User as UserIcon,
  Sparkles,
  AlertCircle,
  Info,
  Slash,
} from 'lucide-react'
import { clsx } from 'clsx'
import { studio, type StudioChatMessage, type StudioPendingChatAnchor } from '@/lib/api'

interface ChatPanelProps {
  sessionId: string
  /** When the user clicks an element in the iframe, the workspace passes the
   *  inspector data here so the next chat message includes it as anchor. */
  anchorHint?: { dvId?: string | null; tag?: string; classes?: string } | null
  /** One-shot anchor from Components tab “Use in chat” (takes precedence over anchorHint). */
  pendingChatAnchor?: StudioPendingChatAnchor | null
  /** Called after a message is sent successfully using pendingChatAnchor. */
  onPendingChatAnchorConsumed?: () => void
  /** Whether the dev preview is active (iframe has a running app). */
  previewActive?: boolean
  /** True after “Source map” has been built (bridge + data-dv-id in the app). */
  hasSourceMap?: boolean
}

export type ChatPanelHandle = {
  focusInput: () => void
}

const SLASH_COMMANDS = [
  { cmd: '/edit', desc: 'Make a targeted change to the code' },
  { cmd: '/explain', desc: 'Explain the selected element or file' },
  { cmd: '/component', desc: 'Save selection as a reusable component' },
  { cmd: '/theme', desc: 'Update colors, fonts, or design tokens' },
  { cmd: '/deploy', desc: 'Deploy this app to a live URL' },
]

function parseIntent(text: string): { intent: string | null; clean: string } {
  // Avoid `/s` (dotAll): TS targets below ES2018 reject it; `[\s\S]` matches any newline.
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/)
  if (!m) return { intent: null, clean: text }
  return { intent: m[1].toLowerCase(), clean: m[2] }
}

/** True while the user is still typing the slash token (e.g. `/`, `/ed`) before the first space. */
function shouldShowSlashCommandMenu(value: string): boolean {
  const line = value.split('\n')[0].trimStart()
  if (!line.startsWith('/')) return false
  return !/\s/.test(line.slice(1))
}

function applySlashCommand(
  cmd: string,
  setInput: (s: string) => void,
  inputRef: RefObject<HTMLTextAreaElement | null>
) {
  setInput(cmd + ' ')
  inputRef.current?.focus()
}

function SlashCommandPicker({
  input,
  onPick,
}: {
  input: string
  onPick: (fullCmd: string) => void
}) {
  const prefix = input.split('\n')[0].trimStart().toLowerCase()
  const matched = SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().startsWith(prefix))
  const list = matched.length ? matched : SLASH_COMMANDS
  return (
    <div className="absolute left-0 right-0 bottom-full mb-1.5 px-3 pointer-events-none z-[70] flex justify-center">
      <div className="pointer-events-auto w-full max-h-48 overflow-y-auto rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl">
        {list.map((c) => (
          <button
            key={c.cmd}
            type="button"
            onClick={() => onPick(c.cmd)}
            className="w-full text-left px-3 py-2 hover:bg-[var(--hover-bg)] flex flex-col gap-0.5 border-b border-[var(--card-border)]/60 last:border-0"
          >
            <span className="text-[11px] font-mono font-semibold text-dv-accent">{c.cmd}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Compact menu from the / button — same entries as typing “/” in the field. */
function SlashCommandsMenu({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div
      className="absolute left-0 bottom-[calc(100%+4px)] z-[80] w-[min(17rem,calc(100vw-2rem))] max-h-52 overflow-y-auto rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl py-0.5"
      role="listbox"
    >
      {SLASH_COMMANDS.map((c) => (
        <button
          key={c.cmd}
          type="button"
          role="option"
          onClick={() => onPick(c.cmd)}
          className="w-full text-left px-3 py-2 hover:bg-[var(--hover-bg)] flex flex-col gap-0.5"
        >
          <span className="text-[11px] font-mono font-semibold text-dv-accent">{c.cmd}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{c.desc}</span>
        </button>
      ))}
    </div>
  )
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel(
    {
      sessionId,
      anchorHint,
      pendingChatAnchor,
      onPendingChatAnchorConsumed,
      previewActive = false,
      hasSourceMap = false,
    },
    ref
  ) {
  const [messages, setMessages] = useState<StudioChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSlash, setShowSlash] = useState(false)
  const [commandsMenuOpen, setCommandsMenuOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const streamFirstTokenRef = useRef(true)

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus()
    },
  }))

  useEffect(() => {
    if (!sessionId) return
    void studio.listChatMessages(sessionId).then((r) => setMessages(r.messages))
  }, [sessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy])

  useEffect(() => {
    if (!commandsMenuOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setCommandsMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [commandsMenuOpen])

  const send = async () => {
    if (!input.trim() || busy) return
    const text = input.trim()
    const { intent, clean } = parseIntent(text)
    setBusy(true)
    setError(null)
    setInput('')
    setShowSlash(false)
    setCommandsMenuOpen(false)

    // Optimistic user bubble
    const optimisticUser: StudioChatMessage = {
      id: `tmp_${Date.now()}`,
      ts: new Date().toISOString(),
      role: 'user',
      content: clean || text,
    }
    setMessages((prev) => [...prev, optimisticUser])

    const assistantTempId = `tmp_asst_${Date.now()}`
    streamFirstTokenRef.current = true

    const usedPending = Boolean(pendingChatAnchor)
    const anchorPayload =
      pendingChatAnchor != null
        ? {
            dv_id: pendingChatAnchor.dvId ?? undefined,
            tag: pendingChatAnchor.tag ?? undefined,
            classes: pendingChatAnchor.classes ?? undefined,
            symbol: pendingChatAnchor.componentLabel,
            file: pendingChatAnchor.sourceFile ?? undefined,
            component_label: pendingChatAnchor.componentLabel,
            source_file: pendingChatAnchor.sourceFile ?? undefined,
            source_line:
              pendingChatAnchor.sourceLine !== undefined &&
              pendingChatAnchor.sourceLine !== null
                ? pendingChatAnchor.sourceLine
                : undefined,
          }
        : anchorHint
          ? {
              dv_id: anchorHint.dvId,
              tag: anchorHint.tag,
              classes: anchorHint.classes,
            }
          : undefined

    try {
      await studio.sendChatMessageStream(
        sessionId,
        {
          message: clean || text,
          intent: intent || undefined,
          anchor: anchorPayload,
        },
        {
          onToken: (t) => {
            setMessages((prev) => {
              if (streamFirstTokenRef.current) {
                streamFirstTokenRef.current = false
                return [
                  ...prev,
                  {
                    id: assistantTempId,
                    ts: new Date().toISOString(),
                    role: 'assistant' as const,
                    content: t,
                  },
                ]
              }
              return prev.map((m) =>
                m.id === assistantTempId
                  ? { ...m, content: m.content + t }
                  : m
              )
            })
          },
          onComplete: (r) => {
            setMessages((prev) => [
              ...prev.filter(
                (m) => m.id !== optimisticUser.id && m.id !== assistantTempId
              ),
              r.user_message,
              r.assistant_message,
            ])
            if (
              typeof window !== 'undefined' &&
              r.assistant_message?.action &&
              (r.assistant_message.action as any).type === 'edit_applied'
            ) {
              window.dispatchEvent(new Event('studio:edit-applied'))
            }
            if (usedPending) {
              onPendingChatAnchorConsumed?.()
            }
          },
          onError: (msg) => {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
            setError(msg)
          },
        }
      )
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id))
      setError(e?.message || 'Failed to send message')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const clearChat = async () => {
    if (!confirm('Clear all chat messages for this session?')) return
    try {
      await studio.clearChat(sessionId)
      setMessages([])
    } catch {
      /* noop */
    }
  }

  return (
    <aside className="relative z-10 w-[380px] flex-shrink-0 border-r border-[var(--card-border)] bg-[var(--card-bg)]/40 flex flex-col min-h-0 min-w-0 overflow-hidden h-full">
      {/* Header */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-dv-accent" />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            AI Assistant
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Clear chat"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Pending component anchor (one-shot from Components tab) */}
      {pendingChatAnchor?.componentLabel && (
        <div className="mx-3 mt-3 p-2 rounded-lg bg-violet-500/10 border border-violet-500/25 text-[11px] text-violet-200 flex flex-col gap-0.5">
          <span className="font-semibold text-violet-100">Next message targets</span>
          <span className="text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)]">{pendingChatAnchor.componentLabel}</span>
            {pendingChatAnchor.sourceFile ? (
              <span className="font-mono text-[10px] ml-1 text-[var(--text-muted)]">
                · {pendingChatAnchor.sourceFile}
                {pendingChatAnchor.sourceLine != null ? `:${pendingChatAnchor.sourceLine}` : ''}
              </span>
            ) : null}
          </span>
        </div>
      )}

      {/* Anchor hint banner */}
      {anchorHint?.tag && !pendingChatAnchor?.componentLabel && (
        <div className="mx-3 mt-3 p-2 rounded-lg bg-dv-accent/5 border border-dv-accent/20 text-[11px] text-dv-accent flex items-center gap-2">
          <span className="font-mono">
            &lt;{anchorHint.tag}
            {anchorHint.classes ? ` class="${anchorHint.classes.slice(0, 30)}"` : ''}&gt;
          </span>
          <span className="text-[var(--text-muted)] ml-auto">selected</span>
        </div>
      )}

      {previewActive && !anchorHint?.tag && !pendingChatAnchor?.componentLabel && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] text-[11px] text-[var(--text-secondary)] leading-snug flex gap-2">
          <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-100/95 mb-1">How to anchor an edit</p>
            <ol className="list-decimal pl-3.5 space-y-1">
              {!hasSourceMap && (
                <li>
                  Click <span className="text-[var(--text-primary)] font-medium">Source map</span> in
                  the Studio top bar once (installs the preview click bridge).
                </li>
              )}
              <li>
                Above the preview, keep <span className="text-[var(--text-primary)] font-medium">Pick for AI</span>{' '}
                active (scanner icon), not &quot;Use app&quot;.
              </li>
              <li>
                Click the element in the live preview. You should see an indigo hover outline, then
                <span className="text-dv-accent font-medium"> selected </span>
                with a tag name at the top of this panel.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Messages — min-h-0 is required so flex-1 can shrink and scroll inside a fixed-height row */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-4 space-y-4"
      >
        {messages.length === 0 && !busy && (
          <div className="flex flex-col items-center text-center px-4 py-6">
            <div className="w-10 h-10 rounded-2xl bg-dv-accent/10 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-dv-accent" />
            </div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">
              Describe a change
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-4">
              Type a change below, or select a UI element first:{' '}
              <span className="text-[var(--text-primary)]">Source map</span> once →{' '}
              <span className="text-[var(--text-primary)]">Pick for AI</span> on the preview toolbar → click
              the component → then chat.
            </p>
            <div className="space-y-1.5 w-full">
              {SLASH_COMMANDS.map((c) => (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => applySlashCommand(c.cmd, setInput, inputRef)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-dv-accent/30 transition-colors"
                >
                  <span className="text-[11px] font-mono font-semibold text-dv-accent">
                    {c.cmd}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-2">
                    {c.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] px-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking...
          </div>
        )}

        {error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex items-start gap-2">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input — one compact row; slash chips live in the / menu or via typing "/" */}
      <div className="relative border-t border-[var(--card-border)] px-2.5 py-2 shrink-0">
        {showSlash && (
          <SlashCommandPicker
            input={input}
            onPick={(cmd) => {
              applySlashCommand(cmd, setInput, inputRef)
              setShowSlash(false)
            }}
          />
        )}
        <div className="relative rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus-within:border-dv-accent/40 transition-colors">
          <div className="flex items-end gap-2 p-2">
            <div ref={slashMenuRef} className="relative shrink-0 pb-px">
              <button
                type="button"
                aria-expanded={commandsMenuOpen}
                aria-haspopup="listbox"
                aria-label="Slash commands"
                title="Commands"
                onClick={() => setCommandsMenuOpen((o) => !o)}
                disabled={busy}
                className={clsx(
                  'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                  commandsMenuOpen
                    ? 'border-dv-accent/50 bg-dv-accent/15 text-dv-accent'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)]/80 text-[var(--text-muted)] hover:text-dv-accent hover:border-dv-accent/30'
                )}
              >
                <Slash className="w-4 h-4" />
              </button>
              {commandsMenuOpen && (
                <SlashCommandsMenu
                  onPick={(cmd) => {
                    applySlashCommand(cmd, setInput, inputRef)
                    setCommandsMenuOpen(false)
                  }}
                />
              )}
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const raw = e.target.value
                setInput(raw)
                setShowSlash(shouldShowSlashCommandMenu(raw))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
                if (e.key === 'Escape') {
                  setShowSlash(false)
                  setCommandsMenuOpen(false)
                }
              }}
              placeholder="Ask or describe a change…"
              rows={2}
              disabled={busy}
              className="flex-1 min-h-[2.75rem] max-h-28 w-full min-w-0 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] py-2 px-0.5 focus:outline-none resize-none leading-snug"
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || busy}
              aria-label="Send"
              title="Send · Enter"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dv-accent text-white hover:bg-dv-accent/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] transition-all"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="px-2 pb-1.5 text-[9px] leading-tight text-[var(--text-faint)]">
            <kbd className="rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1 py-px font-mono">/</kbd>{' '}
            commands ·{' '}
            <kbd className="rounded border border-[var(--card-border)] bg-[var(--card-bg)] px-1 py-px font-mono">
              Shift+Enter
            </kbd>{' '}
            newline
          </p>
        </div>
      </div>
    </aside>
  )
})

ChatPanel.displayName = 'ChatPanel'

function Message({ message }: { message: StudioChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser
            ? 'bg-[var(--input-bg)] text-[var(--text-secondary)]'
            : 'bg-dv-accent/10 text-dv-accent'
        }`}
      >
        {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`min-w-0 flex-1 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-full text-[12px] leading-relaxed px-3 py-2 rounded-2xl ${
            isUser
              ? 'bg-dv-accent text-white rounded-tr-sm'
              : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-primary)] rounded-tl-sm'
          }`}
        >
          <MessageBody content={message.content} />
        </div>
        {message.action?.classification && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md bg-[var(--input-bg)] border border-[var(--input-border)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              {(message.action.classification as any).tier}
            </span>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="text-[var(--text-secondary)]">
              risk: {(message.action.classification as any).risk_class}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBody({ content }: { content: string }) {
  // Minimal markdown: **bold**, _italic_, line breaks
  const html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="font-mono text-[11px] bg-black/20 px-1 py-0.5 rounded">$1</code>')
    .replace(/\n/g, '<br />')
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
