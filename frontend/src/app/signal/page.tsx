'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Zap,
  Search,
  Loader2,
  ChevronRight,
  FolderGit2,
  ArrowRight,
  Radio,
  Layers,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import {
  repositories,
  signal as signalApi,
  Repository,
  SignalPacket,
  SignalPacketResponse,
} from '@/lib/api'
import SignalPacketCard from '@/components/signal/SignalPacketCard'
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

interface PacketEntry extends SignalPacket {
  repoId: string
  repoName: string
  repoFullName: string
}

export default function SignalHubPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all')
  const [entries, setEntries] = useState<PacketEntry[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    async function loadAll() {
      setIsLoading(true)
      try {
        const repoList = await repositories.list()
        setRepos(repoList)
        const all: PacketEntry[] = []

        const results = await Promise.allSettled(
          repoList
            .filter((repo) => repo.is_indexed)
            .map(async (repo) => {
              try {
                const response = await signalApi.listPackets(repo.id)
                const packets = response.packets || []
                return packets.map((p) => ({
                  ...p,
                  repoId: repo.id,
                  repoName: repo.name,
                  repoFullName: repo.full_name,
                }))
              } catch {
                return []
              }
            })
        )

        for (const result of results) {
          if (result.status === 'fulfilled') {
            all.push(...result.value)
          }
        }

        // Sort by date, newest first
        all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setEntries(all)
      } catch {
        toast.error('Failed to load signal data')
      } finally {
        setIsLoading(false)
      }
    }
    loadAll()
  }, [])

  const filteredEntries = entries.filter((pkt) => {
    if (filterUrgency !== 'all' && pkt.business_urgency !== filterUrgency) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        pkt.summary.toLowerCase().includes(q) ||
        pkt.repoName.toLowerCase().includes(q) ||
        (pkt.root_cause_hypothesis || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  /* Computed stats */
  const criticalCount = entries.filter((e) => e.business_urgency === 'critical' || e.business_urgency === 'high').length
  const uniqueRepos = new Set(entries.map((e) => e.repoId)).size
  const indexedRepos = repos.filter((r) => r.is_indexed)

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-amber-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* ── Animated gradient mesh background ── */}
        <GradientMesh className="fixed opacity-40" />

        {/* ── Frosted top bar ── */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1200px] mx-auto">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Signal
            </h1>
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
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-amber-400/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-amber-500/50" />
                Customer Voice
              </span>
            </motion.div>

            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
              delay={0.15}
            >
              Signal Hub
            </RevealText>

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.7 }}
            >
              {entries.length === 0 && !isLoading
                ? 'Map customer pain to engineering action. Import tickets and let AI trace them to code.'
                : `${entries.length} signal packet${entries.length === 1 ? '' : 's'} across ${uniqueRepos} repositor${uniqueRepos === 1 ? 'y' : 'ies'}.`}
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
                label="Packets"
                value={entries.length}
                icon={<Zap className="w-6 h-6" />}
                color="#f59e0b"
                sub={entries.length === 1 ? 'signal packet' : 'signal packets'}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Critical"
                value={criticalCount}
                icon={<AlertTriangle className="w-6 h-6" />}
                color="#ef4444"
                sub="high priority signals"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Repos"
                value={uniqueRepos}
                icon={<FolderGit2 className="w-6 h-6" />}
                color="#22d3ee"
                sub={uniqueRepos === 1 ? 'repository tracked' : 'repositories tracked'}
              />
            </motion.div>
          </motion.div>

          {/* ── Repository quick-nav ── */}
          {indexedRepos.length > 0 && (
            <motion.div
              className="mb-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium mb-4">
                <span className="w-6 h-[1px] bg-white/10" />
                Open Signal for a repository
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {indexedRepos.map((repo) => (
                  <Link
                    key={repo.id}
                    href={`/repository/${repo.id}/signal`}
                    className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-amber-500/25 hover:bg-amber-500/[0.03] transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{repo.name}</p>
                      <p className="text-[12px] text-[var(--text-muted)] truncate">{repo.full_name}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-faint)] group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

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
                placeholder="Search signal packets…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 pl-10 text-[13px] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/25 transition-all"
              />
            </div>

            {/* Urgency filter */}
            <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setFilterUrgency(level)}
                  className={`px-3 py-1.5 rounded-[10px] text-[12px] font-semibold capitalize transition-all ${
                    filterUrgency === level
                      ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
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
              {filteredEntries.length} packet{filteredEntries.length === 1 ? '' : 's'}
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
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto mb-3" />
                <span className="text-[14px] text-[var(--text-muted)]">Loading signal packets…</span>
              </div>
            </motion.div>
          ) : filteredEntries.length > 0 ? (
            <div className="space-y-4">
              {filteredEntries.map((pkt, i) => (
                <motion.div
                  key={pkt.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease, delay: 0.1 + i * 0.04 }}
                >
                  <Link href={`/repository/${pkt.repoId}/signal`}>
                    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 group hover:border-amber-500/20 transition-all cursor-pointer">
                      {/* Top row */}
                      <div className="flex items-start gap-4 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] line-clamp-1 mb-1">
                            {pkt.summary}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                              pkt.business_urgency === 'critical' ? 'bg-red-500/10 text-red-400' :
                              pkt.business_urgency === 'high' ? 'bg-orange-500/10 text-orange-400' :
                              pkt.business_urgency === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-gray-500/10 text-gray-400'
                            }`}>
                              {pkt.business_urgency}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--input-bg)] text-[var(--text-secondary)] text-[10px] font-bold tracking-wider uppercase">
                              {pkt.issue_type}
                            </span>
                            <span className="text-[11px] text-[var(--text-faint)] font-mono">
                              {pkt.repoName}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--text-faint)] group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                      </div>

                      {/* Code matches count + date */}
                      <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)] pt-3 border-t border-[var(--text-faint)]">
                        <span className="flex items-center gap-1.5">
                          <Radio className="w-3 h-3" />
                          {pkt.code_matches?.length || 0} code match{(pkt.code_matches?.length || 0) === 1 ? '' : 'es'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />
                          {pkt.owner_suggestions?.length || 0} suggestion{(pkt.owner_suggestions?.length || 0) === 1 ? '' : 's'}
                        </span>
                        {pkt.created_at && (
                          <span className="text-[11px] text-[var(--text-faint)] font-mono ml-auto">
                            {new Date(pkt.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : entries.length > 0 ? (
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Search className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">
                No signal packets match your filters.
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

/* ── Empty State ── */
function EmptyState() {
  return (
    <motion.div
      className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center py-28 px-8 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <GradientMesh className="opacity-60" />

      <div className="relative z-10">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 border border-amber-500/10 flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(245,158,11,0.1)]">
          <Zap className="w-8 h-8 text-amber-400" />
        </div>

        <RevealText
          as="h3"
          className="text-[26px] font-bold tracking-[-0.03em] mb-3 text-[var(--text-primary)]"
        >
          No signal packets yet
        </RevealText>

        <p className="text-[15px] text-[var(--text-secondary)] mb-10 max-w-sm mx-auto leading-relaxed">
          Open a repository&apos;s Signal page and import your first customer ticket to generate an AI-powered Signal Packet.
        </p>

        <Link
          href="/repositories"
          className="group inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-8 py-3.5 rounded-full hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] active:scale-[0.96] transition-all duration-500"
        >
          <FolderGit2 className="w-4 h-4" />
          Go to Repositories
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
        </Link>
      </div>
    </motion.div>
  )
}
