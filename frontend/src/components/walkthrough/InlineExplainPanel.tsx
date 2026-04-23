'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Lightbulb,
  HelpCircle,
  Cog,
  Send,
  Loader2,
  MessageSquare,
  Code2,
  ChevronDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import { explain, InlineExplainResponse, ConversationMessage } from '@/lib/api'

interface CodeSelection {
  code: string
  startLine: number
  endLine: number
}

interface InlineExplainPanelProps {
  repositoryId: string
  filePath: string
  selection: CodeSelection
  fullFileContent: string
  onClose: () => void
}

export function InlineExplainPanel({
  repositoryId,
  filePath,
  selection,
  fullFileContent,
  onClose,
}: InlineExplainPanelProps) {
  const [explanation, setExplanation] = useState<InlineExplainResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Follow-up chat state
  const [chatMessages, setChatMessages] = useState<ConversationMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch inline explanation on mount / selection change
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setExplanation(null)
    setChatMessages([])

    explain
      .inline(
        repositoryId,
        filePath,
        selection.code,
        selection.startLine,
        selection.endLine,
        fullFileContent
      )
      .then((res) => {
        if (!cancelled) {
          setExplanation(res)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to generate explanation')
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [repositoryId, filePath, selection, fullFileContent])

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendFollowup = useCallback(async () => {
    const question = chatInput.trim()
    if (!question || isChatLoading) return

    setChatInput('')
    const userMsg: ConversationMessage = { role: 'user', content: question }
    const updatedHistory = [...chatMessages, userMsg]
    setChatMessages(updatedHistory)
    setIsChatLoading(true)

    // Include the initial explanation as first assistant message in history
    const fullHistory: ConversationMessage[] = []
    if (explanation) {
      fullHistory.push({
        role: 'assistant',
        content: `What: ${explanation.what}\nWhy: ${explanation.why}\nHow: ${explanation.how}`,
      })
    }
    fullHistory.push(...updatedHistory)

    try {
      const res = await explain.followup(
        repositoryId,
        filePath,
        selection.code,
        question,
        fullHistory,
        fullFileContent
      )
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.answer }])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't generate a response. Please try again." },
      ])
    } finally {
      setIsChatLoading(false)
      inputRef.current?.focus()
    }
  }, [chatInput, isChatLoading, chatMessages, explanation, repositoryId, filePath, selection, fullFileContent])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendFollowup()
    }
  }

  return (
    <motion.div
      className="h-full flex flex-col bg-[var(--card-bg)] border-l border-[var(--card-border)]"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: '100%', opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Code Explanation</h3>
            <p className="text-[10px] text-[var(--text-muted)]">
              Lines {selection.startLine}–{selection.endLine}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--input-bg)] transition-colors"
        >
          <X className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Selected code preview */}
      <div className="px-4 py-2.5 border-b border-[var(--card-border)] flex-shrink-0">
        <div className="bg-[var(--page-bg)] rounded-lg p-3 max-h-24 overflow-auto">
          <pre className="text-[11px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap break-words leading-relaxed">
            {selection.code.length > 500 ? selection.code.slice(0, 500) + '…' : selection.code}
          </pre>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="p-6 space-y-4">
            {/* Skeleton loaders */}
            {['What', 'Why', 'How'].map((label) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[var(--input-bg)] animate-pulse" />
                  <div className="w-12 h-3 rounded bg-[var(--input-bg)] animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 rounded bg-[var(--input-bg)] animate-pulse w-full" />
                  <div className="h-3 rounded bg-[var(--input-bg)] animate-pulse w-4/5" />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span className="text-[11px] text-[var(--text-muted)]">Analyzing code with AI…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-4">
              <p className="text-[13px] text-red-400">{error}</p>
            </div>
          </div>
        )}

        {explanation && !isLoading && (
          <div className="p-4 space-y-4">
            {/* What */}
            <ExplainSection
              icon={<Code2 className="w-3.5 h-3.5 text-blue-400" />}
              label="What it does"
              content={explanation.what}
              color="blue"
            />

            {/* Why */}
            <ExplainSection
              icon={<HelpCircle className="w-3.5 h-3.5 text-amber-400" />}
              label="Why it exists"
              content={explanation.why}
              color="amber"
            />

            {/* How */}
            <ExplainSection
              icon={<Cog className="w-3.5 h-3.5 text-purple-400" />}
              label="How it fits"
              content={explanation.how}
              color="purple"
            />

            {/* Chat messages */}
            {chatMessages.length > 0 && (
              <div className="pt-2 border-t border-[var(--card-border)] space-y-3">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[10px] tracking-[0.1em] uppercase text-[var(--text-muted)] font-medium">
                    Follow-up
                  </span>
                </div>
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-indigo-500/10 text-[var(--text-primary)] ml-6'
                        : 'bg-[var(--input-bg)] text-[var(--text-secondary)] mr-2'
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-2 px-3.5 py-2">
                    <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                    <span className="text-[11px] text-[var(--text-muted)]">Thinking…</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input — always visible after explanation loads */}
      {explanation && !isLoading && (
        <div className="px-3 py-3 border-t border-[var(--card-border)] flex-shrink-0">
          <div className="flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question…"
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              disabled={isChatLoading}
            />
            <button
              onClick={handleSendFollowup}
              disabled={!chatInput.trim() || isChatLoading}
              className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function ExplainSection({
  icon,
  label,
  content,
  color,
}: {
  icon: React.ReactNode
  label: string
  content: string
  color: 'blue' | 'amber' | 'purple'
}) {
  const bgColor = {
    blue: 'bg-blue-500/5 border-blue-500/10',
    amber: 'bg-amber-500/5 border-amber-500/10',
    purple: 'bg-purple-500/5 border-purple-500/10',
  }[color]

  return (
    <div className={clsx('rounded-xl border p-3.5', bgColor)}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{content}</p>
    </div>
  )
}
