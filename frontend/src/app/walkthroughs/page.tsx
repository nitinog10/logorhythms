'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Play,
  Search,
  Clock,
  FileCode,
  Trash2,
  Loader2,
  Sparkles,
  ChevronRight,
  FolderGit2,
  ArrowRight,
  Timer,
  BarChart3,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { repositories, walkthroughs, Repository, WalkthroughScript } from '@/lib/api'
import toast from 'react-hot-toast'
import GradientMesh from '@/components/landing/GradientMesh'
import TiltCard from '@/components/landing/TiltCard'
import RevealText from '@/components/landing/RevealText'

/* ── Animation tokens ── */
const ease = [0.23, 1, 0.32, 1] as const
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}

/* ── Counter hook ── */
function useCounter(target: number, duration = 1500) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref as any, { once: true, margin: '-40px' })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const increment = target / (duration / 16)
    const timer = setInterval(() => {
      start += increment
      if (start >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [isInView, target, duration])

  return { ref, count }
}

interface WalkthroughEntry extends WalkthroughScript {
  repoId: string
  repoName: string
}

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = seconds / 60
  return `${parseFloat(mins.toFixed(1))} min`
}

export default function WalkthroughsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'developer' | 'manager'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'duration'>('recent')
  const [entries, setEntries] = useState<WalkthroughEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    async function loadAll() {
      setIsLoading(true)
      try {
        const repos = await repositories.list()
        const all: WalkthroughEntry[] = []

        const results = await Promise.allSettled(
          repos
            .filter((repo) => repo.is_indexed)
            .map(async (repo) => {
              const repoWalkthroughs = await walkthroughs.getForRepo(repo.id)
              return repoWalkthroughs.map((wt) => ({
                ...wt,
                repoId: repo.id,
                repoName: repo.name,
              }))
            })
        )

        for (const result of results) {
          if (result.status === 'fulfilled') {
            all.push(...result.value)
          }
        }

        setEntries(all)
      } catch {
        toast.error('Failed to load walkthroughs')
      } finally {
        setIsLoading(false)
      }
    }
    loadAll()
  }, [])

  const filteredEntries = entries
    .filter((wt) => {
      if (filterMode !== 'all' && wt.view_mode !== filterMode) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          wt.title.toLowerCase().includes(q) ||
          wt.file_path.toLowerCase().includes(q) ||
          wt.repoName.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'duration') return b.total_duration - a.total_duration
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await walkthroughs.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      toast.success('Walkthrough deleted')
    } catch {
      toast.error('Failed to delete walkthrough')
    }
  }

  /* Computed stats */
  const totalDurationMins = Math.round(entries.reduce((acc, wt) => acc + wt.total_duration, 0) / 60)
  const uniqueRepos = new Set(entries.map((e) => e.repoId)).size

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* ── Animated gradient mesh background ── */}
        <GradientMesh className="fixed opacity-40" />

        {/* ── Frosted top bar ── */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1200px] mx-auto">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Walkthroughs</h1>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Dashboard <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-12 max-w-[1200px] mx-auto">

          {/* ── Hero heading ── */}
          <div className="mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-purple-400/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-purple-500/50" />
                AI-Powered
              </span>
            </motion.div>

            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
              delay={0.15}
            >
              Your Walkthroughs
            </RevealText>

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.7 }}
            >
              {entries.length === 0 && !isLoading
                ? 'Generate AI-powered code walkthroughs from your indexed repositories.'
                : `${entries.length} walkthrough${entries.length === 1 ? '' : 's'} generated across ${uniqueRepos} repositor${uniqueRepos === 1 ? 'y' : 'ies'}.`}
            </motion.p>
          </div>

          {/* ── Stat cards — bento tilt grid ── */}
          <motion.div
            className="grid grid-cols-3 gap-5 mb-12"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Total"
                value={entries.length}
                icon={<Sparkles className="w-6 h-6" />}
                color="#a855f7"
                sub={entries.length === 1 ? 'walkthrough' : 'walkthroughs'}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Duration"
                value={totalDurationMins}
                icon={<Timer className="w-6 h-6" />}
                color="#6366f1"
                sub="minutes total"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Repos"
                value={uniqueRepos}
                icon={<FolderGit2 className="w-6 h-6" />}
                color="#22d3ee"
                sub={uniqueRepos === 1 ? 'repository covered' : 'repositories covered'}
              />
            </motion.div>
          </motion.div>

          {/* ── Filter bar ── */}
          <motion.div
            className="flex items-center gap-3 mb-8 flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
              <input
                type="text"
                placeholder="Search walkthroughs…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 pl-10 text-[13px] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/25 transition-all"
              />
            </div>

            {/* Segmented control */}
            <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              {(['all', 'developer', 'manager'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-4 py-1.5 rounded-[10px] text-[12px] font-semibold capitalize transition-all ${
                    filterMode === mode
                      ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'duration')}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl py-2.5 px-3 text-[12px] font-medium text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-indigo-500/25 appearance-none cursor-pointer hover:bg-[var(--input-bg)] transition-all"
            >
              <option value="recent">Recent</option>
              <option value="duration">Longest</option>
            </select>
          </motion.div>

          {/* ── Section label ── */}
          <div className="mb-6 flex items-center justify-between">
            <motion.span
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="w-6 h-[1px] bg-white/10" />
              {filteredEntries.length} walkthrough{filteredEntries.length === 1 ? '' : 's'}
            </motion.span>
          </div>

          {/* ── Content states ── */}
          {isLoading ? (
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] flex items-center justify-center py-24"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="text-center">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto mb-3" />
                <span className="text-[14px] text-[var(--text-muted)]">Loading walkthroughs…</span>
              </div>
            </motion.div>
          ) : filteredEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredEntries.map((wt, i) => (
                <motion.div
                  key={wt.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease, delay: 0.1 + i * 0.06 }}
                >
                  <WalkthroughCard
                    wt={wt}
                    navigatingId={navigatingId}
                    onNavigate={(id) => {
                      setNavigatingId(id)
                      router.push(`/repository/${wt.repoId}/walkthrough?file=${encodeURIComponent(wt.file_path)}`)
                    }}
                    onDelete={handleDelete}
                  />
                </motion.div>
              ))}
            </div>
          ) : entries.length > 0 ? (
            /* Search returned no results */
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Search className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">
                No walkthroughs match your filters.
              </p>
            </motion.div>
          ) : (
            <EmptyState />
          )}
        </div>
      </main>
    </div>
  )
}

/* ── Animated Stat Card ── */
function AnimatedStatCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  sub: string
}) {
  const { ref, count } = useCounter(value)

  return (
    <TiltCard className="rounded-2xl">
      <div className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 overflow-hidden">
        {/* Subtle ambient glow */}
        <div
          className="absolute top-0 right-0 w-[150px] h-[150px] rounded-full blur-[60px] opacity-[0.07] pointer-events-none"
          style={{ backgroundColor: color }}
        />

        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `${color}12`,
                color: color,
                border: `1px solid ${color}20`,
              }}
            >
              {icon}
            </div>
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
          </div>

          <p
            className="text-[40px] font-bold tracking-[-0.04em] tabular-nums leading-none mb-2"
            style={{ color }}
          >
            <span ref={ref}>{count}</span>
          </p>
          <p className="text-[12px] text-[var(--text-muted)] font-medium tracking-wide">{sub}</p>
        </div>
      </div>
    </TiltCard>
  )
}

/* ── Walkthrough Card ── */
function WalkthroughCard({
  wt,
  navigatingId,
  onNavigate,
  onDelete,
}: {
  wt: WalkthroughEntry
  navigatingId: string | null
  onNavigate: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}) {
  return (
    <TiltCard className="rounded-2xl">
      <div
        onClick={() => onNavigate(wt.id)}
        className="block relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 group transition-all duration-300 cursor-pointer"
      >
        {/* Top: play icon + title row */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
            style={{
              backgroundColor: wt.view_mode === 'developer' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(168, 85, 247, 0.08)',
              border: `1px solid ${wt.view_mode === 'developer' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(168, 85, 247, 0.15)'}`,
            }}
          >
            {navigatingId === wt.id ? (
              <Loader2 className={`w-5 h-5 animate-spin ${wt.view_mode === 'developer' ? 'text-indigo-400' : 'text-purple-400'}`} />
            ) : (
              <Play className={`w-5 h-5 ml-0.5 ${wt.view_mode === 'developer' ? 'text-indigo-400 group-hover:text-indigo-300' : 'text-purple-400 group-hover:text-purple-300'} transition-colors`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--text-primary)] truncate transition-colors mb-1">
              {wt.title}
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                  wt.view_mode === 'developer'
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'bg-purple-500/10 text-purple-400'
                }`}
              >
                {wt.view_mode}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--input-bg)] text-[var(--text-secondary)] text-[10px] font-bold tracking-wider uppercase">
                {wt.segments.length} segments
              </span>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-[var(--text-faint)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
        </div>

        {/* File path + repo */}
        <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)] mb-5">
          <span className="flex items-center gap-1.5 truncate">
            <FileCode className="w-3 h-3 flex-shrink-0" />
            {wt.file_path}
          </span>
          <span className="text-[var(--text-faint)]">·</span>
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <FolderGit2 className="w-3 h-3" />
            {wt.repoName}
          </span>
        </div>

        {/* Bottom meta */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--text-faint)]">
          <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatDuration(wt.total_duration)}
            </span>
            {wt.created_at && (
              <span className="text-[11px] text-[var(--text-faint)] font-mono">
                {new Date(wt.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Hover actions */}
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNavigate(wt.id)
              }}
              className="text-[12px] font-semibold px-3.5 py-1.5 rounded-full bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
            >
              {navigatingId === wt.id ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Loading…</>
              ) : (
                'Play'
              )}
            </button>
            <button
              onClick={(e) => onDelete(wt.id, e)}
              className="p-2 rounded-full hover:bg-red-500/10 hover:text-red-400 transition-colors text-[var(--text-faint)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </TiltCard>
  )
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <motion.div
      className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center py-28 px-8 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      {/* Background mesh */}
      <GradientMesh className="opacity-60" />

      <div className="relative z-10">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/15 to-indigo-500/15 border border-purple-500/10 flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(168,85,247,0.1)]">
          <Sparkles className="w-8 h-8 text-purple-400" />
        </div>

        <RevealText
          as="h3"
          className="text-[26px] font-bold tracking-[-0.03em] mb-3 text-[var(--text-primary)]"
        >
          No walkthroughs yet
        </RevealText>

        <p className="text-[15px] text-[var(--text-secondary)] mb-10 max-w-sm mx-auto leading-relaxed">
          Open an indexed repository and generate your first AI-powered code walkthrough with voice narration.
        </p>

        <Link
          href="/dashboard"
          className="group inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-8 py-3.5 rounded-full hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] active:scale-[0.96] transition-all duration-500"
        >
          <Play className="w-4 h-4" />
          Go to Dashboard
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
        </Link>
      </div>
    </motion.div>
  )
}
