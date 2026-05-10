'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FolderGit2,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ArrowRight,
  Github,
  ArrowLeft,
  Rocket,
  CheckCircle2,
  Link as LinkIcon,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { ConnectRepoModal } from '@/components/dashboard/ConnectRepoModal'
import { repositories, Repository, studio, integrations } from '@/lib/api'
import toast from 'react-hot-toast'
import { formatRelativeTime } from '@/lib/utils'

export default function IntegrationsPage() {
  const router = useRouter()
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [repos, setRepos] = useState<Repository[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const handleDelete = async (id: string) => {
    if (!confirm('Disconnect this repository? This removes it from DocuVerse but does not delete it from GitHub.'))
      return
    setBusyId(id)
    try {
      await repositories.delete(id)
      setRepos((prev) => prev.filter((r) => r.id !== id))
      toast.success('Repository disconnected')
    } catch {
      toast.error('Failed to disconnect repository')
    } finally {
      setBusyId(null)
    }
  }

  const openInStudio = async (repoId: string) => {
    setBusyId(repoId)
    try {
      const list = await studio.listSessions().catch(() => ({ sessions: [], total: 0 }))
      const existing = list.sessions.find(
        (s) => s.kind === 'imported' && (s as any).source_id === repoId
      )
      if (existing) {
        router.push(`/studio/${existing.id}`)
        return
      }
      const created = await studio.createSession({
        kind: 'imported',
        source_id: repoId,
      })
      router.push(`/studio/${created.id}`)
    } catch {
      toast.error('Failed to open repository in Studio')
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)]">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-8 py-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
              >
                <ArrowLeft className="w-3 h-3" />
                Settings
              </Link>
              <h1 className="text-[24px] font-bold tracking-tight">Integrations</h1>
              <p className="text-[14px] text-[var(--text-secondary)] mt-1 max-w-2xl">
                Connect GitHub repositories to import and edit them in Studio. Disconnecting here
                does not delete anything from GitHub.
              </p>
            </div>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center gap-2 bg-dv-accent text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl hover:bg-dv-accent/90 active:scale-[0.97] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Connect repository
            </button>
          </div>

          {/* GitHub identity card */}
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--input-bg)] flex items-center justify-center">
                <Github className="w-5 h-5 text-[var(--text-primary)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold">GitHub</h3>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Used to clone, commit, and open pull requests on your repos.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
            </div>
          </section>

          <VercelCard />

          <div className="h-5" />

          {/* Connected repos */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Connected repositories
              </h2>
              <button
                onClick={fetchRepos}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-[12px] text-red-300">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm py-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading repositories...
              </div>
            ) : repos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card-bg)] p-10 text-center">
                <FolderGit2 className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-[14px] font-medium text-[var(--text-primary)]">
                  No repositories connected yet
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1 mb-4 max-w-sm mx-auto">
                  Connect a GitHub repository and edit it visually in Studio.
                </p>
                <button
                  onClick={() => setIsConnectModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-dv-accent text-white text-[12px] font-semibold px-3 py-2 rounded-lg hover:bg-dv-accent/90"
                >
                  <Plus className="w-3 h-3" />
                  Connect your first repository
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {repos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-dv-accent/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--input-bg)] flex items-center justify-center flex-shrink-0">
                      <FolderGit2 className="w-4 h-4 text-[var(--text-secondary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate">
                          {repo.full_name || repo.name}
                        </span>
                        {repo.language && (
                          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                            {repo.language}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {repo.description ||
                          `Connected ${formatRelativeTime(repo.created_at || '')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openInStudio(repo.id)}
                        disabled={busyId === repo.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-dv-accent/10 text-dv-accent hover:bg-dv-accent/15 disabled:opacity-50"
                      >
                        {busyId === repo.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            Open in Studio
                            <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </button>
                      {repo.full_name && (
                        <a
                          href={`https://github.com/${repo.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(repo.id)}
                        disabled={busyId === repo.id}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                        title="Disconnect"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <ConnectRepoModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onConnected={() => {
          setIsConnectModalOpen(false)
          fetchRepos()
        }}
      />
    </div>
  )
}

function VercelCard() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [showInput, setShowInput] = useState(false)

  useEffect(() => {
    void integrations.vercelStatus()
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false))
  }, [])

  const connect = async () => {
    if (!token.trim()) {
      toast.error('Paste a Vercel token first')
      return
    }
    setBusy(true)
    try {
      await integrations.vercelConnect(token.trim())
      setConnected(true)
      setToken('')
      setShowInput(false)
      toast.success('Vercel connected')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to connect Vercel')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect Vercel? Your token will be removed from DocuVerse.'))
      return
    setBusy(true)
    try {
      await integrations.vercelDisconnect()
      setConnected(false)
      toast.success('Vercel disconnected')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to disconnect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
          <Rocket className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold">Vercel</h3>
          <p className="text-[12px] text-[var(--text-secondary)]">
            One-click deploy from Studio. Stored as an encrypted personal access
            token.
          </p>
        </div>
        {connected === null ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
        ) : connected ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <LinkIcon className="w-3.5 h-3.5" />
            Not connected
          </span>
        )}
      </div>

      {connected ? (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--card-border)]">
          <span className="text-[11px] text-[var(--text-muted)]">
            Studio will use this token to deploy your generated and imported
            projects.
          </span>
          <button
            onClick={disconnect}
            disabled={busy}
            className="text-[12px] font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : showInput ? (
        <div className="space-y-2 pt-3 border-t border-[var(--card-border)]">
          <p className="text-[11px] text-[var(--text-muted)]">
            Create a token at{' '}
            <a
              href="https://vercel.com/account/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dv-accent hover:underline"
            >
              vercel.com/account/tokens
            </a>{' '}
            and paste it below.
          </p>
          <input
            type="password"
            placeholder="vc_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-dv-accent/40"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowInput(false)}
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={connect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-dv-accent text-white px-3 py-1.5 rounded-lg hover:bg-dv-accent/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Connect
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-dv-accent hover:text-dv-accent/80"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Vercel token
        </button>
      )}
    </section>
  )
}
