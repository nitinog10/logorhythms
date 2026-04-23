'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  FolderGit2,
  Plus,
  Search,
  Grid,
  List,
  CheckCircle2,
  Loader2,
  Clock,
  Trash2,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  Code2,
  Sparkles,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { ConnectRepoModal } from '@/components/dashboard/ConnectRepoModal'
import { repositories, Repository } from '@/lib/api'
import { clsx } from 'clsx'
import { formatRelativeTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import GradientMesh from '@/components/landing/GradientMesh'
import TiltCard from '@/components/landing/TiltCard'
import RevealText from '@/components/landing/RevealText'

/* ── Animation tokens ── */
const ease = [0.23, 1, 0.32, 1] as const

/* ── Language color map ── */
const langColor: Record<string, string> = {
  Python: '#3572A5',
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Java: '#B07219',
  C: '#555555',
  'C++': '#F34B7D',
  'C#': '#239120',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89E051',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Vue: '#41B883',
}



type ViewMode = 'grid' | 'list'
type FilterMode = 'all' | 'indexed' | 'pending'

export default function RepositoriesPage() {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [repos, setRepos] = useState<Repository[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [indexingId, setIndexingId] = useState<string | null>(null)

  const fetchRepos = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await repositories.list()
      setRepos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchRepos() }, [fetchRepos])

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    setDeletingId(id)
    try {
      await repositories.delete(id)
      setRepos((prev) => prev.filter((r) => r.id !== id))
      toast.success('Repository removed')
    } catch {
      toast.error('Failed to remove repository')
    } finally {
      setDeletingId(null)
    }
  }

  const handleIndex = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    setIndexingId(id)
    try {
      await repositories.index(id)
      setRepos((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_indexed: true, indexed_at: new Date().toISOString() } : r))
      )
      toast.success('Indexing started')
    } catch {
      toast.error('Failed to index repository')
    } finally {
      setIndexingId(null)
    }
  }

  const filteredRepos = repos
    .filter((repo) => {
      if (filterMode === 'indexed' && !repo.is_indexed) return false
      if (filterMode === 'pending' && repo.is_indexed) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          repo.name.toLowerCase().includes(q) ||
          repo.full_name.toLowerCase().includes(q) ||
          repo.description?.toLowerCase().includes(q) ||
          repo.language?.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      const dateA = a.indexed_at || a.created_at || ''
      const dateB = b.indexed_at || b.created_at || ''
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

  /* Computed stats */
  const indexedCount = repos.filter((r) => r.is_indexed).length
  const pendingCount = repos.length - indexedCount

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* ── Animated gradient mesh background ── */}
        <GradientMesh className="fixed opacity-[var(--glow-opacity)]" />

        {/* ── Frosted top bar ── */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1200px] mx-auto">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Repositories</h1>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-5 py-2 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Connect
            </button>
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
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-indigo-400/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-indigo-500/50" />
                Connected
              </span>
            </motion.div>

            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
              delay={0.15}
            >
              Your Repositories
            </RevealText>

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.7 }}
            >
              {repos.length === 0 && !isLoading
                ? 'Connect your GitHub repositories to start generating AI-powered walkthroughs.'
                : `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} connected — ${indexedCount} indexed and ready.`}
            </motion.p>
          </div>



          {/* ── Filter bar ── */}
          <motion.div
            className="flex flex-wrap items-center gap-3 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
              <input
                type="text"
                placeholder="Search repositories…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 pl-10 text-[13px] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/25 transition-all"
              />
            </div>

            {/* Filter segmented control */}
            <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              {(['all', 'indexed', 'pending'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={clsx(
                    'px-4 py-1.5 rounded-[10px] text-[12px] font-semibold capitalize transition-all',
                    filterMode === mode
                      ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'px-2.5 py-1.5 rounded-[10px] transition-all',
                  viewMode === 'list'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                )}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'px-2.5 py-1.5 rounded-[10px] transition-all',
                  viewMode === 'grid'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>

            {/* Count label */}
            <motion.span
              className="ml-auto inline-flex items-center gap-2 text-[12px] tracking-[0.15em] uppercase text-[var(--text-muted)] font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <span className="w-6 h-[1px] bg-white/10" />
              {filteredRepos.length} repositor{filteredRepos.length === 1 ? 'y' : 'ies'}
            </motion.span>
          </motion.div>

          {/* ── Content ── */}
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
              className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-3" />
              <p className="text-[14px] text-red-400 mb-6">{error}</p>
              <button
                onClick={fetchRepos}
                className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] font-semibold text-[13px] px-5 py-2.5 rounded-xl hover:bg-[var(--input-bg)] transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </motion.div>
          ) : filteredRepos.length === 0 ? (
            <EmptyState
              hasRepos={repos.length > 0}
              searchQuery={searchQuery}
              onConnect={() => setIsConnectModalOpen(true)}
            />
          ) : (
            <AnimatePresence mode="wait">
              {viewMode === 'grid' ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredRepos.map((repo, i) => (
                      <motion.div
                        key={repo.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease, delay: 0.05 + i * 0.04 }}
                      >
                        <RepoGridCard
                          repo={repo}
                          deletingId={deletingId}
                          indexingId={indexingId}
                          onDelete={handleDelete}
                          onIndex={handleIndex}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] overflow-hidden">
                    {filteredRepos.map((repo, i) => (
                      <motion.div
                        key={repo.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, ease, delay: 0.05 + i * 0.03 }}
                      >
                        <RepoListRow
                          repo={repo}
                          isLast={i === filteredRepos.length - 1}
                          deletingId={deletingId}
                          indexingId={indexingId}
                          onDelete={handleDelete}
                          onIndex={handleIndex}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      <ConnectRepoModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onConnected={fetchRepos}
      />
    </div>
  )
}



/* ── Grid Card ── */
function RepoGridCard({
  repo, deletingId, indexingId, onDelete, onIndex,
}: {
  repo: Repository; deletingId: string | null; indexingId: string | null
  onDelete: (id: string, e?: React.MouseEvent) => void; onIndex: (id: string, e?: React.MouseEvent) => void
}) {
  const lc = repo.language ? langColor[repo.language] : undefined

  return (
    <TiltCard className="rounded-2xl">
      <Link
        href={`/repository/${repo.id}`}
        className="block relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 group transition-all duration-300"
      >
        {/* Top: icon + status */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300"
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
            }}
          >
            <FolderGit2 className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
          </div>
          {repo.is_indexed ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-bold tracking-wider uppercase">
              <CheckCircle2 className="w-3 h-3" /> Indexed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 text-[10px] font-bold tracking-wider uppercase">
              Pending
            </span>
          )}
        </div>

        {/* Name + description */}
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--text-primary)] truncate transition-colors mb-1.5">
          {repo.name}
        </h3>
        <p className="text-[12px] text-[var(--text-muted)] line-clamp-2 mb-5 leading-relaxed min-h-[36px]">
          {repo.description || 'No description'}
        </p>

        {/* Bottom meta */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--text-faint)]">
          <div className="flex items-center gap-3">
            {repo.language && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lc || '#888' }} />
                {repo.language}
              </span>
            )}
            {repo.indexed_at && (
              <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(repo.indexed_at)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!repo.is_indexed && (
              <button
                onClick={(e) => onIndex(repo.id, e)}
                disabled={indexingId === repo.id}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                title="Index"
              >
                {indexingId === repo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={(e) => onDelete(repo.id, e)}
              disabled={deletingId === repo.id}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Remove"
            >
              {deletingId === repo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </Link>
    </TiltCard>
  )
}

/* ── List Row ── */
function RepoListRow({
  repo, isLast, deletingId, indexingId, onDelete, onIndex,
}: {
  repo: Repository; isLast: boolean; deletingId: string | null; indexingId: string | null
  onDelete: (id: string, e?: React.MouseEvent) => void; onIndex: (id: string, e?: React.MouseEvent) => void
}) {
  const lc = repo.language ? langColor[repo.language] : undefined

  return (
    <Link
      href={`/repository/${repo.id}`}
      className={clsx(
        'flex items-center gap-4 px-5 py-4 group hover:bg-[var(--hover-bg)] transition-all',
        !isLast && 'border-b border-[var(--text-faint)]'
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-500/8 border border-indigo-500/12 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/15 transition-colors">
        <FolderGit2 className="w-5 h-5 text-indigo-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="font-semibold text-[14px] text-[var(--text-primary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
            {repo.full_name}
          </span>
          {repo.is_indexed ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-bold tracking-wider uppercase flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" /> Indexed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 text-[10px] font-bold tracking-wider uppercase flex-shrink-0">
              Pending
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-muted)] truncate">{repo.description || 'No description'}</p>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        {repo.language && (
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lc || '#888' }} />
            {repo.language}
          </span>
        )}
        {repo.indexed_at && (
          <span className="text-[12px] text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(repo.indexed_at)}
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!repo.is_indexed && (
            <button
              onClick={(e) => onIndex(repo.id, e)}
              disabled={indexingId === repo.id}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
            >
              {indexingId === repo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={(e) => onDelete(repo.id, e)}
            disabled={deletingId === repo.id}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            {deletingId === repo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        <ChevronRight className="w-4 h-4 text-[var(--text-faint)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  )
}

/* ── Empty State ── */
function EmptyState({
  hasRepos, searchQuery, onConnect,
}: {
  hasRepos: boolean; searchQuery: string; onConnect: () => void
}) {
  if (hasRepos) {
    return (
      <motion.div
        className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Search className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-3" />
        <p className="text-[14px] text-[var(--text-secondary)]">No repos match &ldquo;{searchQuery}&rdquo;</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center py-28 px-8 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <GradientMesh className="opacity-60" />
      <div className="relative z-10">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/10 flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(99,102,241,0.1)]">
          <FolderGit2 className="w-8 h-8 text-indigo-400" />
        </div>
        <RevealText
          as="h3"
          className="text-[26px] font-bold tracking-[-0.03em] mb-3 text-[var(--text-primary)]"
        >
          No repositories connected
        </RevealText>
        <p className="text-[15px] text-[var(--text-secondary)] mb-10 max-w-sm mx-auto leading-relaxed">
          Connect a GitHub repository to start generating AI-powered code walkthroughs.
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
