'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import Link from 'next/link'
import { Sidebar } from '@/components/layout/Sidebar'
import { ConnectRepoModal } from '@/components/dashboard/ConnectRepoModal'
import { CreateRepoModal } from '@/components/github/CreateRepoModal'
import { repositories, Repository } from '@/lib/api'
import { useUserStore } from '@/lib/store'
import { formatRelativeTime } from '@/lib/utils'

/* ── Animation tokens ── */
const ease = [0.25, 0.1, 0.25, 1] as const
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
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

export default function DashboardPage() {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
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

  const filteredRepos = connectedRepos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
    <div className="min-h-screen bg-dv-bg flex text-dv-text selection:bg-dv-accent/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* ── Ambient background glows ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-25%] right-[5%] w-[700px] h-[500px] bg-dv-accent/[0.03] rounded-full blur-[140px]" />
          <div className="absolute bottom-[-15%] left-[25%] w-[500px] h-[400px] bg-dv-purple/[0.025] rounded-full blur-[120px]" />
          <div className="absolute top-[40%] left-[-5%] w-[350px] h-[350px] bg-dv-indigo/[0.02] rounded-full blur-[100px]" />
        </div>

        {/* ── Frosted top bar ── */}
        <div className="sticky top-0 z-20 bg-[var(--bar-bg)] backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-dv-border">
          <div className="flex items-center justify-between px-8 h-12 max-w-[1100px] mx-auto">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Dashboard</h1>
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="w-8 h-8 rounded-full flex items-center justify-center text-dv-text/30 hover:text-dv-text/60 hover:bg-[var(--glass-6)] transition-all"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 text-[13px] font-medium px-4 py-1.5 rounded-full bg-[var(--glass-5)] backdrop-blur-xl border border-dv-border text-dv-text/50 hover:bg-[var(--glass-10)] hover:text-dv-text/70 active:scale-[0.97] transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="flex items-center gap-2 text-[13px] font-medium bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] px-4 py-1.5 rounded-full hover:bg-[var(--btn-solid-hover)] active:scale-[0.97] transition-all shadow-[var(--btn-solid-shadow)]"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-10 max-w-[1100px] mx-auto">

          {/* ── Hero greeting ── */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
          >
            <p className="text-[13px] font-medium text-dv-text/25 uppercase tracking-[0.08em] mb-3">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.035em] leading-[1.1] mb-3">
              {user?.username ? (
                <>
                  Good {getGreeting()},{' '}
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-accent via-dv-indigo to-dv-purple">
                    {user.username}
                  </span>
                </>
              ) : (
                <>
                  Welcome to{' '}
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-accent to-dv-purple">
                    DocuVerse
                  </span>
                </>
              )}
            </h2>
            <p className="text-[15px] text-dv-text/30 leading-relaxed max-w-lg">
              {connectedRepos.length === 0
                ? 'Connect a GitHub repository to generate AI-powered code walkthroughs with voice narration.'
                : `${connectedRepos.length} repositor${connectedRepos.length === 1 ? 'y' : 'ies'} connected — ${indexedCount} indexed and ready for walkthroughs.`}
            </p>
          </motion.div>

          {/* ── Stat cards — bento row ── */}
          <motion.div
            className="grid grid-cols-3 gap-3 mb-10"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fadeUp}>
              <StatCard
                label="Total Repos"
                value={connectedRepos.length}
                icon={<FolderGit2 className="w-[18px] h-[18px]" />}
                color="rgb(var(--dv-accent))"
                sub={connectedRepos.length === 1 ? 'repository' : 'repositories'}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard
                label="Indexed"
                value={indexedCount}
                icon={<CheckCircle2 className="w-[18px] h-[18px]" />}
                color="rgb(var(--dv-success))"
                sub="ready for walkthrough"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard
                label="Pending"
                value={pendingCount}
                icon={<Clock className="w-[18px] h-[18px]" />}
                color={pendingCount > 0 ? '#ff9f0a' : '#48484a'}
                sub={pendingCount > 0 ? 'indexing in progress' : 'all caught up'}
              />
            </motion.div>
          </motion.div>

          {/* ── Quick‑action pills ── */}
          <motion.div
            className="flex items-center gap-2 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-full bg-[var(--glass-5)] backdrop-blur-xl border border-dv-border text-dv-text/50 hover:bg-[var(--glass-10)] hover:text-dv-text/70 hover:border-dv-border transition-all active:scale-[0.97] shadow-[var(--inset)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Repository
            </button>
            <Link
              href="/walkthroughs"
              className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-full bg-[var(--glass-5)] backdrop-blur-xl border border-dv-border text-dv-text/50 hover:bg-[var(--glass-10)] hover:text-dv-text/70 hover:border-dv-border transition-all shadow-[var(--inset)]"
            >
              <Play className="w-3.5 h-3.5" />
              Walkthroughs
            </Link>
          </motion.div>

          {/* ── Your Repositories section ── */}
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-dv-text/25 uppercase tracking-[0.06em]">
              Your Repositories
            </h3>
            {connectedRepos.length > 3 && (
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dv-text/20" />
                <input
                  type="text"
                  placeholder="Filter…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--glass-4)] border border-dv-border rounded-lg px-3 py-1.5 pl-9 text-[13px] text-dv-text placeholder:text-dv-text/20 focus:outline-none focus:ring-1 focus:ring-dv-accent/25 focus:border-dv-accent/30 transition-all"
                />
              </div>
            )}
          </div>

          {/* ── Content states ── */}
          {isLoading ? (
            <motion.div
              className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border flex items-center justify-center py-20 shadow-[var(--inset)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="text-center">
                <Loader2 className="w-6 h-6 text-dv-accent animate-spin mx-auto mb-3" />
                <span className="text-[14px] text-dv-text/25">Loading repositories…</span>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border text-center py-16 shadow-[var(--inset)]"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="w-12 h-12 rounded-full bg-dv-error/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-dv-error" />
              </div>
              <p className="text-[14px] text-dv-error/70 mb-5">{error}</p>
              <button
                onClick={fetchConnectedRepos}
                className="inline-flex items-center gap-2 text-[13px] font-medium bg-[var(--glass-6)] backdrop-blur-xl border border-dv-border text-dv-text/50 px-5 py-2 rounded-full hover:bg-[var(--glass-10)] hover:text-dv-text/70 active:scale-[0.97] transition-all shadow-[var(--inset)]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </motion.div>
          ) : connectedRepos.length === 0 ? (
            <EmptyState onConnect={() => setIsConnectModalOpen(true)} />
          ) : filteredRepos.length === 0 ? (
            <motion.div
              className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border text-center py-16 shadow-[var(--inset)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Search className="w-5 h-5 text-dv-text/15 mx-auto mb-3" />
              <p className="text-[14px] text-dv-text/30">
                No repositories match &quot;{searchQuery}&quot;
              </p>
            </motion.div>
          ) : (
            <div className="rounded-2xl bg-[var(--glass-4)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]">
              {filteredRepos.map((repo, i) => (
                <motion.div
                  key={repo.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04, ease }}
                >
                  <RepoRow repo={repo} isLast={i === filteredRepos.length - 1} />
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
    </div>
  )
}

/* ── Stat Card ── */
function StatCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  sub: string
}) {
  return (
    <div className="group rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-5 hover:bg-[var(--glass-5)] hover:border-dv-border transition-all duration-300 shadow-[var(--inset)]">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-[11px] flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {icon}
        </div>
        <span className="text-[13px] font-medium text-dv-text/40">{label}</span>
      </div>
      <p className="text-[32px] font-bold tracking-[-0.03em] tabular-nums leading-none mb-1.5" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-dv-text/20 font-medium">{sub}</p>
    </div>
  )
}

/* ── Repository Row (inline — no separate page) ── */
function RepoRow({ repo, isLast }: { repo: Repository; isLast: boolean }) {
  const lc = repo.language ? langColor[repo.language] : undefined

  return (
    <Link
      href={`/repository/${repo.id}`}
      className={`flex items-center gap-4 px-5 py-4 group hover:bg-[var(--glass-3)] transition-all ${!isLast ? 'border-b border-dv-border-subtle' : ''}`}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-[var(--glass-4)] border border-dv-border flex items-center justify-center flex-shrink-0 group-hover:bg-dv-accent/10 group-hover:border-dv-accent/20 transition-all">
        <FolderGit2 className="w-[18px] h-[18px] text-dv-text/30 group-hover:text-dv-accent transition-colors" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="text-[14px] font-semibold tracking-[-0.01em] truncate group-hover:text-dv-text transition-colors">
            {repo.full_name || repo.name}
          </span>
          {repo.is_indexed ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-dv-success/10 text-dv-success text-[11px] font-semibold flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              Indexed
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff9f0a]/10 text-[#ff9f0a] text-[11px] font-semibold flex-shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" />
              Indexing
            </span>
          )}
        </div>
        <p className="text-[12px] text-dv-text/25 truncate">
          {repo.description || 'No description'}
        </p>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {repo.language && (
          <span className="flex items-center gap-1.5 text-[12px] text-dv-text/30">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: lc || '#636366' }}
            />
            {repo.language}
          </span>
        )}
        {repo.indexed_at && (
          <span className="text-[11px] text-dv-text/20 hidden sm:block">
            {formatRelativeTime(repo.indexed_at)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-dv-text/10 group-hover:text-dv-text/30 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  )
}

/* ── Empty State ── */
function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <motion.div
      className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border text-center py-24 px-8 shadow-[var(--inset)] relative overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
    >
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-dv-accent/[0.04] rounded-full blur-[80px] pointer-events-none" />

      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-dv-accent/15 to-dv-indigo/15 border border-dv-accent/10 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(10,132,255,0.08)]">
          <GitBranch className="w-7 h-7 text-dv-accent" />
        </div>
        <h3 className="text-[22px] font-bold tracking-[-0.02em] mb-2">Connect your first repo</h3>
        <p className="text-[14px] text-dv-text/30 mb-8 max-w-sm mx-auto leading-relaxed">
          Import a GitHub repository to generate AI-powered narrated walkthroughs of your codebase.
        </p>
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-2.5 bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[14px] px-7 py-3 rounded-full hover:bg-[var(--btn-solid-hover)] active:scale-[0.97] transition-all shadow-[0_2px_20px_rgba(255,255,255,0.1)]"
        >
          <Plus className="w-4 h-4" />
          Connect Repository
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

