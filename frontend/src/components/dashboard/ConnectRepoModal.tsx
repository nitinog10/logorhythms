'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Search,
  FolderGit2,
  Lock,
  Globe,
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { repositories, GitHubRepository } from '@/lib/api'

interface ConnectRepoModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected?: () => void
}

export function ConnectRepoModal({ isOpen, onClose, onConnected }: ConnectRepoModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([])

  const fetchRepositories = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const repos = await repositories.listGitHub()
      setGithubRepos(repos)
    } catch (err) {
      console.error('Failed to fetch repositories:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
      fetchRepositories()
    } else {
      setVisible(false)
      setSelectedRepo(null)
      setSearchQuery('')
    }
  }, [isOpen, fetchRepositories])

  const filteredRepos = githubRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleConnect = async () => {
    if (!selectedRepo) return

    setIsConnecting(true)
    setError(null)
    try {
      await repositories.connect(selectedRepo.full_name)
      onConnected?.()
      onClose()
    } catch (err) {
      console.error('Failed to connect repository:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect repository')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={clsx(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl transition-all duration-200',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <div className="bg-[var(--card-bg)] backdrop-blur-2xl border border-[var(--card-border)] rounded-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--text-faint)]">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Connect Repository</h2>
              <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                Select a GitHub repository to connect
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center hover:bg-[var(--input-border)] transition-colors active:scale-[0.92]"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-[var(--text-faint)]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl py-3 pl-11 pr-4
                         text-[var(--text-primary)] placeholder:text-[var(--text-faint)] text-[14px]
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40"
              />
            </div>
          </div>

          {/* Repository list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-7 h-7 text-indigo-400 animate-spin mx-auto mb-3" />
                <p className="text-[13px] text-[var(--text-muted)]">Loading your repositories...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-[14px] text-red-400 mb-4">{error}</p>
                <button
                  onClick={fetchRepositories}
                  className="text-[13px] font-medium px-4 py-2 rounded-full bg-[var(--input-bg)] text-[var(--text-muted)] hover:bg-[var(--input-border)] inline-flex items-center gap-2 transition-all active:scale-[0.97]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    className={clsx(
                      'w-full p-4 flex items-center gap-4 transition-all border-b border-[var(--text-faint)] active:scale-[0.99]',
                      selectedRepo?.id === repo.id
                        ? 'bg-indigo-500/8'
                        : 'hover:bg-[var(--hover-bg)]'
                    )}
                    onClick={() => setSelectedRepo(repo)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--input-bg)] flex items-center justify-center">
                      <FolderGit2 className="w-5 h-5 text-indigo-400" />
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-[var(--text-primary)]">{repo.name}</span>
                        {repo.private ? (
                          <Lock className="w-3 h-3 text-[var(--text-muted)]" />
                        ) : (
                          <Globe className="w-3 h-3 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <p className="text-[13px] text-[var(--text-muted)] line-clamp-1">
                        {repo.description || 'No description'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
                      {repo.language && (
                        <span className="px-2 py-0.5 rounded-md bg-[var(--input-bg)] text-[11px]">
                          {repo.language}
                        </span>
                      )}
                      {repo.stars > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5" />
                          {repo.stars}
                        </span>
                      )}
                      {selectedRepo?.id === repo.id && (
                        <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                      )}
                    </div>
                  </button>
                ))}

                {filteredRepos.length === 0 && githubRepos.length > 0 && (
                  <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
                    No repositories match your search
                  </div>
                )}

                {githubRepos.length === 0 && !isLoading && (
                  <div className="p-8 text-center text-[var(--text-muted)]">
                    <FolderGit2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-[13px]">No repositories found in your GitHub account</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--text-faint)]">
            {error && !isLoading && (
              <div className="mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] text-center">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleClose}
                className="text-[13px] font-medium px-5 py-2.5 rounded-full bg-[var(--input-bg)] text-[var(--text-muted)] hover:bg-[var(--input-border)] transition-all active:scale-[0.97]"
                disabled={isConnecting}
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={!selectedRepo || isConnecting || isLoading}
                className="flex items-center gap-2 bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[13px] px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>Connect Repository</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
