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
  Folder,
  Sparkles,
  AlertCircle,
  BookOpen,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { repositories, files, FileNode, Repository } from '@/lib/api'
import { formatRelativeTime, getLanguageFromPath } from '@/lib/utils'
import toast from 'react-hot-toast'
import DocumentationPanel from '@/components/documentation/DocumentationPanel'

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
          // Repo is now indexed — refresh everything and stop polling
          const updatedRepo = await repositories.get(params.id)
          setRepo(updatedRepo)
          fetchFiles()
          clearInterval(interval)
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [repo, params.id, fetchFiles])

  const handleReindex = async () => {
    setIsReindexing(true)
    try {
      await repositories.index(params.id)
      toast.success('Re-indexing started')
      // Refresh after a moment
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

  // Flatten files for list display
  const flatFiles = flattenFileTree(fileTree).filter((f) => !f.is_directory).slice(0, 30)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dv-bg flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-dv-accent animate-spin" />
        </main>
      </div>
    )
  }

  if (error || !repo) {
    return (
      <div className="min-h-screen bg-dv-bg flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-dv-error mx-auto mb-3" />
            <p className="text-sm text-dv-error mb-4">{error || 'Repository not found'}</p>
            <Link href="/repositories" className="btn-secondary">Back to Repositories</Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dv-bg flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* iOS frosted top bar */}
        <div className="sticky top-0 z-10 glass-bar">
          <div className="flex items-center gap-3 px-8 h-14">
            <Link href="/repositories" className="p-1.5 rounded-[10px] hover:bg-dv-elevated/60 transition-colors">
              <ArrowLeft className="w-4 h-4 text-dv-text-muted" />
            </Link>
            <div className="flex items-center gap-2 text-ios-subhead text-dv-text-muted">
              <span>Repositories</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-dv-text font-semibold">{repo.name}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              className="btn-secondary flex items-center gap-2 text-[13px]"
            >
              {isReindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reindex
            </button>
            <Link href={`/repository/${params.id}/walkthrough`} className="btn-primary flex items-center gap-2 text-[13px]">
              <Play className="w-3.5 h-3.5" />
              Walkthrough
            </Link>
          </div>
        </div>

        <div className="px-8 py-6 max-w-6xl">
          {/* Repo header */}
          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 rounded-ios bg-dv-accent/10 flex items-center justify-center flex-shrink-0">
              <FolderGit2 className="w-6 h-6 text-dv-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-display-sm">{repo.name}</h1>
                {repo.is_indexed ? (
                  <span className="badge-success"><CheckCircle2 className="w-3 h-3 mr-1" /> Indexed</span>
                ) : (
                  <span className="badge-warning">Pending</span>
                )}
              </div>
              <p className="text-ios-subhead text-dv-text-secondary">{repo.full_name}</p>
              {repo.description && (
                <p className="text-ios-subhead text-dv-text-muted mt-2 max-w-2xl">{repo.description}</p>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <div className="card flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-dv-accent/10 flex items-center justify-center text-dv-accent">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[20px] font-bold tabular-nums">{flatFiles.length}</p>
                <p className="text-ios-caption1 text-dv-text-muted">Files</p>
              </div>
            </div>
            {repo.language && (
              <div className="card flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-dv-purple/10 flex items-center justify-center text-dv-purple">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-ios-subhead font-semibold">{repo.language}</p>
                  <p className="text-ios-caption1 text-dv-text-muted">Language</p>
                </div>
              </div>
            )}
            {repo.indexed_at && (
              <div className="card flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-dv-success/10 flex items-center justify-center text-dv-success">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-ios-subhead font-semibold">{formatRelativeTime(repo.indexed_at)}</p>
                  <p className="text-ios-caption1 text-dv-text-muted">Last indexed</p>
                </div>
              </div>
            )}
            <div className="card flex items-center gap-3">
              <a
                href={`https://github.com/${repo.full_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-ios-subhead text-dv-accent hover:brightness-110 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </a>
            </div>
          </div>

          {/* iOS segmented tab switcher */}
          <div className="ios-segmented w-fit mb-6">
            <button
              onClick={() => setActiveTab('files')}
              className={`ios-segmented-item flex items-center gap-1.5 ${activeTab === 'files' ? 'active' : ''}`}
            >
              <FileCode className="w-4 h-4" />
              Files
            </button>
            <button
              onClick={() => setActiveTab('documentation')}
              className={`ios-segmented-item flex items-center gap-1.5 ${activeTab === 'documentation' ? 'active' : ''}`}
            >
              <BookOpen className="w-4 h-4" />
              Documentation
            </button>
          </div>

          {activeTab === 'documentation' ? (
            <DocumentationPanel repoId={params.id} fullName={repo?.full_name} />
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* File list */}
              <div className="lg:col-span-2">
                <h3 className="text-ios-caption1 font-semibold text-dv-text-secondary uppercase tracking-wider mb-4">
                  Files
                </h3>

                {isFilesLoading ? (
                  <div className="card flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-dv-accent animate-spin mr-3" />
                    <span className="text-ios-subhead text-dv-text-muted">Loading file tree…</span>
                  </div>
                ) : flatFiles.length === 0 ? (
                  <div className="card text-center py-12">
                    <FileCode className="w-7 h-7 text-dv-text-muted mx-auto mb-3" />
                    <p className="text-ios-subhead text-dv-text-muted mb-4">
                      {repo.is_indexed ? 'No files found' : 'Index this repository to browse files'}
                    </p>
                    {!repo.is_indexed && (
                      <button onClick={handleReindex} disabled={isReindexing} className="btn-primary inline-flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> Index Now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="ios-group overflow-hidden">
                    {flatFiles.map((file, i) => (
                      <motion.div
                        key={file.path}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="ios-group-item flex items-center gap-3 group"
                      >
                        <File className="w-4 h-4 text-dv-text-muted flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-ios-subhead font-medium truncate">{file.name}</p>
                          <p className="text-ios-caption1 text-dv-text-muted truncate">{file.path}</p>
                        </div>
                        {file.language && (
                          <span className="text-ios-caption1 text-dv-text-muted">{file.language}</span>
                        )}
                        <Link
                          href={`/repository/${params.id}/walkthrough?file=${encodeURIComponent(file.path)}`}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-[10px] text-ios-caption1 font-semibold bg-dv-accent/10 text-dv-accent hover:bg-dv-accent/20 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Play className="w-3 h-3" /> Walkthrough
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-3">
                {/* Quick actions */}
                <div className="card">
                  <h3 className="text-ios-subhead font-semibold mb-3">Quick Actions</h3>
                  <div className="space-y-1.5">
                    <Link
                      href={`/repository/${params.id}/walkthrough`}
                      className="flex items-center gap-3 p-3 rounded-[12px] bg-dv-elevated/40 hover:bg-dv-elevated/70 transition-colors group"
                    >
                      <Play className="w-4 h-4 text-dv-accent" />
                      <span className="text-ios-subhead">Start Walkthrough</span>
                      <ChevronRight className="w-3.5 h-3.5 text-dv-text-muted ml-auto group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    <button
                      onClick={handleReindex}
                      disabled={isReindexing}
                      className="flex items-center gap-3 p-3 rounded-[12px] bg-dv-elevated/40 hover:bg-dv-elevated/70 transition-colors w-full text-left"
                    >
                      {isReindexing ? <Loader2 className="w-4 h-4 animate-spin text-dv-text-muted" /> : <RefreshCw className="w-4 h-4 text-dv-text-muted" />}
                      <span className="text-ios-subhead">Re-index Repository</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('documentation')}
                      className="flex items-center gap-3 p-3 rounded-[12px] bg-dv-elevated/40 hover:bg-dv-elevated/70 transition-colors w-full text-left group"
                    >
                      <BookOpen className="w-4 h-4 text-dv-purple" />
                      <span className="text-ios-subhead">View Documentation</span>
                      <ChevronRight className="w-3.5 h-3.5 text-dv-text-muted ml-auto group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="card border-dv-error/20">
                  <h3 className="text-ios-subhead font-semibold text-dv-error mb-3 flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" /> Danger Zone
                  </h3>
                  <p className="text-ios-caption1 text-dv-text-muted mb-3">
                    Disconnect this repository and delete all walkthroughs.
                  </p>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full py-2 rounded-[10px] border border-dv-error/30 text-dv-error text-ios-caption1 font-semibold hover:bg-dv-error/10 active:scale-[0.98] transition-all disabled:opacity-50"
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

/** Recursively flatten a file tree into a flat array */
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

