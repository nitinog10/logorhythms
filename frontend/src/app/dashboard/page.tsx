'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  FolderGit2,
  Plus,
  Search,
  FileCode,
  GitBranch,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Code2,
  Clock,
  CheckCircle2,
  Play,
  Settings,
  ChevronRight,
  Upload,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { Sidebar } from '@/components/layout/Sidebar'
import { ConnectRepoModal } from '@/components/dashboard/ConnectRepoModal'
import { CreateRepoModal } from '@/components/github/CreateRepoModal'
import { UploadProjectModal } from '@/components/dashboard/UploadProjectModal'
import { repositories, Repository } from '@/lib/api'
import { useUserStore } from '@/lib/store'
import { formatRelativeTime } from '@/lib/utils'
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

/* ── Language color map ── */
const langColor: Record<string, string> = {
  Python: '#3572A5',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
}

/* ── Counter hook (from landing page) ── */
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

export default function DashboardPage() {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mounted, setMounted] = useState(false)
  const [connectedRepos, setConnectedRepos] = useState<Repository[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useUserStore()

  const fetchConnectedRepos = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const repos = await repositories.list()
      setConnectedRepos(repos)
    } catch (err) {
      console.error('Failed to fetch connected repositories:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    fetchConnectedRepos()
  }, [fetchConnectedRepos])

  /* Poll pending repos */
  useEffect(() => {
    const hasPending = connectedRepos.some((r) => !r.is_indexed)
    if (!hasPending || isLoading) return
    const interval = setInterval(() => fetchConnectedRepos(), 8000)
    return () => clearInterval(interval)
  }, [connectedRepos, isLoading, fetchConnectedRepos])

  const filteredRepos = connectedRepos
    .filter((repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = a.indexed_at || a.created_at || ''
      const dateB = b.indexed_at || b.created_at || ''
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

  const indexedCount = connectedRepos.filter((r) => r.is_indexed).length
  const pendingCount = connectedRepos.length - indexedCount

  /* Hydration guard */
  if (!mounted) {
    return (
      <div className="min-h-screen bg-dv-bg flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-dv-accent animate-spin" />
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
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Dashboard</h1>
            <div className="flex items-center gap-2.5">
              <Link
                href="/settings"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--input-bg)] transition-all"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2 text-[13px] font-medium px-4 py-1.5 rounded-full border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)] hover:border-white/[0.15] active:scale-[0.97] transition-all duration-300"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload ZIP
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 text-[13px] font-medium px-4 py-1.5 rounded-full border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)] hover:border-white/[0.15] active:scale-[0.97] transition-all duration-300"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="flex items-center gap-2 text-[13px] font-semibold bg-white text-black px-5 py-1.5 rounded-full hover:bg-white/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-[0.97] transition-all duration-500"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-12 max-w-[1200px] mx-auto">

          {/* ── Hero greeting ── */}
          <div className="mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-indigo-400/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-indigo-500/50" />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </motion.div>

            {user?.username ? (
              <RevealText
                as="h2"
                className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
                delay={0.15}
              >
                {`Good ${getGreeting()}, ${user.username}`}
              </RevealText>
            ) : (
              <RevealText
                as="h2"
                className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
                delay={0.15}
              >
                Welcome to DocuVerse
              </RevealText>
            )}

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.7 }}
            >
              {connectedRepos.length === 0
                ? 'Connect a GitHub repository to generate AI-powered code walkthroughs with voice narration.'
                : `${connectedRepos.length} repositor${connectedRepos.length === 1 ? 'y' : 'ies'} connected — ${indexedCount} indexed and ready for walkthroughs.`}
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
                label="Total Repos"
                value={connectedRepos.length}
                icon={<FolderGit2 className="w-6 h-6" />}
                color="#6366f1"
                sub={connectedRepos.length === 1 ? 'repository' : 'repositories'}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Indexed"
                value={indexedCount}
                icon={<CheckCircle2 className="w-6 h-6" />}
                color="#22c55e"
                sub="ready for walkthrough"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <AnimatedStatCard
                label="Pending"
                value={pendingCount}
                icon={<Clock className="w-6 h-6" />}
                color={pendingCount > 0 ? '#f59e0b' : '#3f3f46'}
                sub={pendingCount > 0 ? 'indexing in progress' : 'all caught up'}
              />
            </motion.div>
          </motion.div>

          {/* ── Quick‑action pills ── */}
          <motion.div
            className="flex items-center gap-3 mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="group flex items-center gap-2 text-[13px] font-medium px-5 py-2.5 rounded-full border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] hover:border-white/[0.18] active:scale-[0.97] transition-all duration-300"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              Add Repository
            </button>
            <Link
              href="/walkthroughs"
              className="group flex items-center gap-2 text-[13px] font-medium px-5 py-2.5 rounded-full border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] hover:border-white/[0.18] transition-all duration-300"
            >
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <Play className="w-3.5 h-3.5 text-purple-400" />
              </div>
              Walkthroughs
            </Link>
          </motion.div>

          {/* ── Your Repositories section ── */}
          <div className="mb-6 flex items-center justify-between">
            <motion.span
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="w-6 h-[1px] bg-white/10" />
              Your Repositories
            </motion.span>
            {connectedRepos.length > 3 && (
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
                <input
                  type="text"
                  placeholder="Filter…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-3 py-2 pl-9 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/25 transition-all"
                />
              </div>
            )}
          </div>

          {/* ── Content states ── */}
          {isLoading ? (
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] flex items-center justify-center py-24"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="text-center">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-3" />
                <span className="text-[14px] text-[var(--text-muted)]">Loading repositories…</span>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-20"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-[14px] text-red-400/70 mb-6">{error}</p>
              <button
                onClick={fetchConnectedRepos}
                className="inline-flex items-center gap-2 text-[13px] font-medium border border-[var(--input-border)] text-[var(--text-secondary)] px-6 py-2.5 rounded-full hover:bg-white/[0.05] hover:text-[var(--text-primary)] active:scale-[0.97] transition-all duration-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </motion.div>
          ) : connectedRepos.length === 0 ? (
            <EmptyState onConnect={() => setIsConnectModalOpen(true)} />
          ) : filteredRepos.length === 0 ? (
            <motion.div
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Search className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">
                No repositories match &quot;{searchQuery}&quot;
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredRepos.map((repo, i) => (
                <motion.div
                  key={repo.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease, delay: 0.15 + i * 0.08 }}
                >
                  <RepoCard repo={repo} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConnectRepoModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onConnected={fetchConnectedRepos}
      />
      <CreateRepoModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={fetchConnectedRepos}
      />
      <UploadProjectModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploaded={fetchConnectedRepos}
      />
    </div>
  )
}

/* ── Animated Stat Card with TiltCard + Count-up ── */
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

/* ── Repository Card (TiltCard grid layout) ── */
function RepoCard({ repo }: { repo: Repository }) {
  const lc = repo.language ? langColor[repo.language] : undefined
  const isUpload = repo.source === 'upload'

  return (
    <TiltCard className="rounded-2xl">
      <Link
        href={`/repository/${repo.id}`}
        className="block relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 group transition-all duration-300"
      >
        {/* Top: icon + name + badges */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
            style={{
              backgroundColor: isUpload ? 'rgba(168, 85, 247, 0.08)' : 'rgba(99, 102, 241, 0.08)',
              border: `1px solid ${isUpload ? 'rgba(168, 85, 247, 0.15)' : 'rgba(99, 102, 241, 0.15)'}`,
            }}
          >
            {isUpload ? (
              <Upload className="w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors" />
            ) : (
              <FolderGit2 className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--text-primary)] truncate transition-colors mb-1">
              {repo.full_name || repo.name}
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              {isUpload && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] font-bold tracking-wider uppercase">
                  <Upload className="w-2.5 h-2.5" />
                  Upload
                </span>
              )}
              {repo.is_indexed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Indexed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-bold tracking-wider uppercase">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Indexing
                </span>
              )}
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-[var(--text-faint)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
        </div>

        {/* Description */}
        <p className="text-[13px] text-[var(--text-muted)] leading-relaxed line-clamp-2 mb-5 min-h-[2.5em]">
          {repo.description || 'No description'}
        </p>

        {/* Bottom meta */}
        <div className="flex items-center gap-4 pt-4 border-t border-[var(--text-faint)]">
          {repo.language && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: lc || '#636366' }}
              />
              {repo.language}
            </span>
          )}
          {(repo.created_at || repo.indexed_at) && (
            <span className="text-[11px] text-[var(--text-faint)] font-mono">
              {formatRelativeTime(repo.created_at || repo.indexed_at!)}
            </span>
          )}
        </div>
      </Link>
    </TiltCard>
  )
}

/* ── Empty State ── */
function EmptyState({ onConnect }: { onConnect: () => void }) {
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
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/10 flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(99,102,241,0.1)]">
          <GitBranch className="w-8 h-8 text-indigo-400" />
        </div>

        <RevealText
          as="h3"
          className="text-[26px] font-bold tracking-[-0.03em] mb-3 text-[var(--text-primary)]"
        >
          Connect your first repo
        </RevealText>

        <p className="text-[15px] text-[var(--text-secondary)] mb-10 max-w-sm mx-auto leading-relaxed">
          Import a GitHub repository to generate AI-powered narrated walkthroughs of your codebase.
        </p>

        <button
          onClick={onConnect}
          className="group inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-8 py-3.5 rounded-full hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] active:scale-[0.96] transition-all duration-500"
        >
          <Plus className="w-4 h-4" />
          Connect Repository
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
        </button>
      </div>
    </motion.div>
  )
}

/* ── Helper ── */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
