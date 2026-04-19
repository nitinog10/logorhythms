'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Radio,
  Layers,
  Settings,
  Plus,
  X,
  Send,
  Zap,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { repositories, signal as signalApi, Repository } from '@/lib/api'
import GradientMesh from '@/components/landing/GradientMesh'
import RevealText from '@/components/landing/RevealText'
import SignalFeed from '@/components/signal/SignalFeed'
import ClusterPanel from '@/components/signal/ClusterPanel'
import SignalConfigForm from '@/components/signal/SignalConfigForm'
import toast from 'react-hot-toast'

const ease = [0.23, 1, 0.32, 1] as const

type TabId = 'feed' | 'clusters' | 'settings'

export default function SignalPage({ params }: { params: { id: string } }) {
  const [repo, setRepo] = useState<Repository | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('feed')
  const [showImportModal, setShowImportModal] = useState(false)

  const fetchRepo = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await repositories.get(params.id)
      setRepo(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository')
    } finally {
      setIsLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchRepo()
  }, [fetchRepo])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </main>
      </div>
    )
  }

  if (error || !repo) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-[14px] text-red-400 mb-6">{error || 'Repository not found'}</p>
            <Link
              href="/repositories"
              className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] font-semibold text-[13px] px-5 py-2.5 rounded-xl hover:bg-[var(--input-bg)] transition-all"
            >
              Back to Repositories
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'feed', label: 'Feed', icon: <Radio className="w-4 h-4" /> },
    { id: 'clusters', label: 'Clusters', icon: <Layers className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        <GradientMesh className="fixed" style={{ opacity: "var(--glow-opacity)" }} />

        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3 px-8 h-14 max-w-[1200px] mx-auto">
            <Link href={`/repository/${params.id}`} className="p-1.5 rounded-xl hover:bg-[var(--input-bg)] transition-colors">
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </Link>
            <div className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">
              <span>{repo.name}</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[var(--text-primary)] font-semibold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Signal
              </span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-5 py-2 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Import Ticket
            </button>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-10 max-w-[1200px] mx-auto">
          {/* Header */}
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Zap className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <RevealText
                  as="h1"
                  className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]"
                  delay={0.1}
                >
                  Signal
                </RevealText>
                <p className="text-[14px] text-[var(--text-secondary)] mt-1">
                  Customer Voice-to-Code Copilot — map customer pain to engineering action
                </p>
              </div>
            </div>
          </motion.div>

          {/* Tab switcher */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="inline-flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === tab.id
                      ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {activeTab === 'feed' && (
              <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SignalFeed repoId={params.id} repoFullName={repo.full_name} />
              </motion.div>
            )}
            {activeTab === 'clusters' && (
              <motion.div key="clusters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ClusterPanel repoId={params.id} />
              </motion.div>
            )}
            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SignalConfigForm repoId={params.id} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Import modal */}
      <AnimatePresence>
        {showImportModal && (
          <ImportModal
            repoId={params.id}
            onClose={() => setShowImportModal(false)}
            onSuccess={() => {
              setShowImportModal(false)
              setActiveTab('feed')
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}


// ── Import Modal ──────────────────────────────────────────────────────

function ImportModal({
  repoId,
  onClose,
  onSuccess,
}: {
  repoId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [segment, setSegment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await signalApi.importSignal(repoId, title, body, {
        customerSegment: segment || undefined,
      })
      if (result.success) {
        toast.success('Signal imported & analyzed')
        onSuccess()
      } else {
        toast.error(result.message || 'Import failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center">
              <Plus className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Import Ticket</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Paste a customer ticket to generate a Signal Packet</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--input-bg)] transition-colors">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Ticket Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Billing page shows wrong currency for EU users"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-[14px] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-indigo-500/50 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Ticket Body *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the customer issue in detail…"
              rows={5}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-[14px] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Customer Segment</label>
            <input
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="e.g. Enterprise, Free tier, Premium"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-[14px] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !body.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-black font-semibold text-[14px] px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.98] transition-all duration-300 disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Import & Analyze
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl border border-[var(--input-border)] text-[var(--text-secondary)] text-[14px] font-semibold hover:bg-[var(--input-bg)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
