'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Play,
  FileCode,
  FolderGit2,
  GitBranch,
  Clock,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Loader2,
  ChevronRight,
  File,
  Sparkles,
  AlertCircle,
  BookOpen,
  History,
  Zap,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { repositories, files, FileNode, Repository } from '@/lib/api'
import { formatRelativeTime, getLanguageFromPath } from '@/lib/utils'
import toast from 'react-hot-toast'
import DocumentationPanel from '@/components/documentation/DocumentationPanel'
import GradientMesh from '@/components/landing/GradientMesh'
import TiltCard from '@/components/landing/TiltCard'
import RevealText from '@/components/landing/RevealText'

const ease = [0.23, 1, 0.32, 1] as const

export default function RepositoryPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [repo, setRepo] = useState<Repository | null>(null)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFilesLoading, setIsFilesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReindexing, setIsReindexing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'files' | 'documentation'>('files')

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const repoData = await repositories.get(params.id)
      setRepo(repoData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository')
    } finally {
      setIsLoading(false)
    }
  }, [params.id])

  const fetchFiles = useCallback(async () => {
    setIsFilesLoading(true)
    try {
      const tree = await files.getTree(params.id)
      setFileTree(tree)
    } catch {
      // Files may not be available if not indexed
    } finally {
      setIsFilesLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchData()
    fetchFiles()
  }, [fetchData, fetchFiles])

  // Poll for index status when repo is not yet indexed
  useEffect(() => {
    if (!repo || repo.is_indexed) return
    const interval = setInterval(async () => {
      try {
        const status = await repositories.getStatus(params.id)
        if (status.is_indexed) {
          const updatedRepo = await repositories.get(params.id)
          setRepo(updatedRepo)
          fetchFiles()
          clearInterval(interval)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [repo, params.id, fetchFiles])

  // Poll for files when repo is indexed but file tree is empty
  useEffect(() => {
    if (!repo || !repo.is_indexed || fileTree.length > 0 || isFilesLoading) return
    const interval = setInterval(() => fetchFiles(), 6000)
    return () => clearInterval(interval)
  }, [repo, fileTree.length, isFilesLoading, fetchFiles])

  const handleReindex = async () => {
    setIsReindexing(true)
    try {
      await repositories.index(params.id)
      toast.success('Re-indexing started')
      setTimeout(() => { fetchData(); fetchFiles() }, 2000)
    } catch {
      toast.error('Failed to start re-indexing')
    } finally {
      setIsReindexing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure? This will remove the repository and all walkthroughs.')) return
    setIsDeleting(true)
    try {
      await repositories.delete(params.id)
      toast.success('Repository disconnected')
      router.push('/repositories')
    } catch {
      toast.error('Failed to disconnect repository')
    } finally {
      setIsDeleting(false)
    }
  }

  const allFiles = flattenFileTree(fileTree).filter((f) => !f.is_directory)
  const flatFiles = allFiles.slice(0, 30)

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

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* Gradient mesh */}
        <GradientMesh className="fixed" style={{ opacity: "var(--glow-opacity)" }} />

        {/* Frosted top bar */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3 px-8 h-14 max-w-[1200px] mx-auto">
            <Link href="/repositories" className="p-1.5 rounded-xl hover:bg-[var(--input-bg)] transition-colors">
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </Link>
            <div className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">
              <span>Repositories</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[var(--text-primary)] font-semibold">{repo.name}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] font-semibold text-[13px] px-4 py-2 rounded-xl hover:bg-[var(--input-bg)] transition-all disabled:opacity-40"
            >
              {isReindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reindex
            </button>
            <Link
              href={`/repository/${params.id}/walkthrough`}
              className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-5 py-2 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300"
            >
              <Play className="w-3.5 h-3.5" />
              Walkthrough
            </Link>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-10 max-w-[1200px] mx-auto">

          {/* ── Repo header ── */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0">
                <FolderGit2 className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <RevealText
                    as="h1"
                    className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]"
                    delay={0.1}
                  >
                    {repo.name}
                  </RevealText>
                  {repo.is_indexed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-[11px] font-bold tracking-wider uppercase">
                      <CheckCircle2 className="w-3 h-3" /> Indexed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-[11px] font-bold tracking-wider uppercase">
                      Pending
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[var(--text-secondary)]">{repo.full_name}</p>
                {repo.description && (
                  <p className="text-[14px] text-[var(--text-muted)] mt-2 max-w-2xl leading-relaxed">{repo.description}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Info cards ── */}
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.2 }}
          >
            <TiltCard className="rounded-2xl">
              <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[22px] font-bold tabular-nums text-indigo-400">{allFiles.length}</p>
                    <p className="text-[11px] text-[var(--text-muted)] font-medium">Files</p>
                  </div>
                </div>
              </div>
            </TiltCard>
            {repo.language && (
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{repo.language}</p>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">Language</p>
                    </div>
                  </div>
                </div>
              </TiltCard>
            )}
            {(repo.created_at || repo.indexed_at) && (
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/15 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{formatRelativeTime(repo.created_at || repo.indexed_at!)}</p>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">Connected</p>
                    </div>
                  </div>
                </div>
              </TiltCard>
            )}
            <TiltCard className="rounded-2xl">
              <a
                href={`https://github.com/${repo.full_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] flex items-center justify-center">
                    <ExternalLink className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <span className="text-[14px] font-medium text-[var(--text-secondary)] group-hover:text-indigo-400 transition-colors">
                    View on GitHub
                  </span>
                </div>
              </a>
            </TiltCard>
          </motion.div>

          {/* ── Tab switcher ── */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="inline-flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              <button
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'files'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <FileCode className="w-4 h-4" /> Files
              </button>
              <button
                onClick={() => setActiveTab('documentation')}
                className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'documentation'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <BookOpen className="w-4 h-4" /> Documentation
              </button>
            </div>
          </motion.div>

          {activeTab === 'documentation' ? (
            <DocumentationPanel repoId={params.id} fullName={repo?.full_name} />
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* ── File list ── */}
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-6 h-[1px] bg-white/10" />
                  <span className="text-[12px] tracking-[0.15em] uppercase text-[var(--text-muted)] font-medium">
                    {allFiles.length} files
                  </span>
                </div>

                {isFilesLoading ? (
                  <div className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mr-3" />
                    <span className="text-[14px] text-[var(--text-muted)]">Loading file tree…</span>
                  </div>
                ) : flatFiles.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] text-center py-16">
                    <FileCode className="w-7 h-7 text-[var(--text-faint)] mx-auto mb-3" />
                    <p className="text-[14px] text-[var(--text-muted)] mb-5">
                      {repo.is_indexed ? 'No files found' : 'Index this repository to browse files'}
                    </p>
                    {!repo.is_indexed && (
                      <button
                        onClick={handleReindex}
                        disabled={isReindexing}
                        className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-6 py-2.5 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300"
                      >
                        <Sparkles className="w-4 h-4" /> Index Now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[var(--hover-bg)] border border-[var(--card-border)] overflow-hidden">
                    {flatFiles.map((file, i) => (
                      <motion.div
                        key={file.path}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02, duration: 0.3, ease }}
                        className={`flex items-center gap-3 px-5 py-3.5 group hover:bg-[var(--hover-bg)] transition-all ${
                          i < flatFiles.length - 1 ? 'border-b border-[var(--text-faint)]' : ''
                        }`}
                      >
                        <File className="w-4 h-4 text-[var(--text-faint)] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{file.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{file.path}</p>
                        </div>
                        {file.language && (
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">{file.language}</span>
                        )}
                        {repo.source === 'github' && (
                          <Link
                            href={`/repository/${params.id}/provenance?file=${encodeURIComponent(file.path)}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <History className="w-3 h-3" /> Why
                          </Link>
                        )}
                        <Link
                          href={`/repository/${params.id}/walkthrough?file=${encodeURIComponent(file.path)}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Play className="w-3 h-3" /> Walkthrough
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Sidebar actions ── */}
              <div className="space-y-4">
                {/* Quick actions */}
                <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    {repo.source === 'github' && (
                      <Link
                        href={`/repository/${params.id}/provenance`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-bg)] hover:bg-[var(--input-bg)] transition-colors group"
                      >
                        <History className="w-4 h-4 text-indigo-400" />
                        <span className="text-[14px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Provenance (Why)</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)] ml-auto group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)] transition-all" />
                      </Link>
                    )}
                    <Link
                      href={`/repository/${params.id}/signal`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-bg)] hover:bg-[var(--input-bg)] transition-colors group"
                    >
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="text-[14px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Signal (Customer Voice)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)] ml-auto group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)] transition-all" />
                    </Link>
                    <Link
                      href={`/repository/${params.id}/walkthrough`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-bg)] hover:bg-[var(--input-bg)] transition-colors group"
                    >
                      <Play className="w-4 h-4 text-purple-400" />
                      <span className="text-[14px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Start Walkthrough</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)] ml-auto group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)] transition-all" />
                    </Link>
                    <button
                      onClick={handleReindex}
                      disabled={isReindexing}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-bg)] hover:bg-[var(--input-bg)] transition-colors w-full text-left"
                    >
                      {isReindexing ? <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" /> : <RefreshCw className="w-4 h-4 text-[var(--text-muted)]" />}
                      <span className="text-[14px] text-[var(--text-secondary)]">Re-index Repository</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('documentation')}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-bg)] hover:bg-[var(--input-bg)] transition-colors w-full text-left group"
                    >
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span className="text-[14px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">View Documentation</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)] ml-auto group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)] transition-all" />
                    </button>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="rounded-2xl bg-[var(--card-bg)] border border-red-500/15 p-5">
                  <h3 className="text-[15px] font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" /> Danger Zone
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mb-4 leading-relaxed">
                    Disconnect this repository and delete all walkthroughs.
                  </p>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full py-2.5 rounded-xl border border-red-500/20 text-red-400 text-[13px] font-semibold hover:bg-red-500/10 active:scale-[0.98] transition-all disabled:opacity-40"
                  >
                    {isDeleting ? 'Disconnecting…' : 'Disconnect Repository'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function flattenFileTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children?.length) {
      result.push(...flattenFileTree(node.children))
    }
  }
  return result
}
