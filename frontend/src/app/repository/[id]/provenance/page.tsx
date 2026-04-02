'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import GradientMesh from '@/components/landing/GradientMesh'
import { ProvenanceCardView } from '@/components/provenance/ProvenanceCard'
import { FileExplorer } from '@/components/walkthrough/FileExplorer'
import { repositories, provenance, files, Repository, ProvenanceCard, type FileNode } from '@/lib/api'
import toast from 'react-hot-toast'

const ease = [0.23, 1, 0.32, 1] as const

export default function ProvenancePage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const initialFile = searchParams.get('file') || ''
  const initialSymbol = searchParams.get('symbol') || ''

  const [repo, setRepo] = useState<Repository | null>(null)
  const [filePath, setFilePath] = useState(initialFile)
  const [symbol, setSymbol] = useState(initialSymbol)
  const [card, setCard] = useState<ProvenanceCard | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const userPickedRef = useRef(false)

  useEffect(() => {
    setFilePath(initialFile)
    setSymbol(initialSymbol)
  }, [initialFile, initialSymbol])

  useEffect(() => {
    ;(async () => {
      setIsLoadingTree(true)
      try {
        const r = await repositories.get(params.id)
        setRepo(r)

        // Tree can fail when repo isn't indexed yet.
        let tree: FileNode[] = []
        try {
          tree = await files.getTree(params.id)
        } catch {
          tree = []
        }

        setFileTree(tree)

        // If the URL didn't specify a file, auto-pick first indexed file.
        if (!initialFile && tree.length > 0 && !userPickedRef.current) {
          const first = findFirstFile(tree)
          if (first?.path) setFilePath(first.path)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load repository')
      } finally {
        setIsLoadingTree(false)
      }
    })()
  }, [params.id, initialFile])

  const runQuery = useCallback(
    async (forceRefresh = false) => {
      if (!filePath.trim()) {
        toast.error('Select a file from the left tree')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await provenance.query(params.id, filePath.trim(), {
          symbol: symbol.trim() || undefined,
          forceRefresh: forceRefresh,
        })
        if (!res.card) {
          setError(res.message || 'No provenance card returned')
          setCard(null)
        } else {
          setCard(res.card)
          setFromCache(!!res.from_cache)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Provenance request failed'
        setError(msg)
        setCard(null)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [filePath, symbol, params.id]
  )

  const handleFeedback = async (rating: 'correct' | 'partially_correct' | 'wrong') => {
    try {
      await provenance.feedback(params.id, filePath.trim(), rating, symbol.trim() || undefined)
      toast.success('Thanks for the feedback')
    } catch {
      toast.error('Could not save feedback')
    }
  }

  if (error && !repo) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-[14px] text-red-400">{error}</p>
            <Link href="/repositories" className="inline-block mt-6 text-indigo-400 text-[14px]">
              Back
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const githubOnly = repo?.source === 'github'
  const explorerFiles = adaptFileTree(fileTree)

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <GradientMesh className="fixed" style={{ opacity: 'var(--glow-opacity)' }} />

        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3 px-8 h-14 max-w-[1100px] mx-auto">
            <Link
              href={`/repository/${params.id}`}
              className="p-1.5 rounded-xl hover:bg-[var(--input-bg)] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </Link>
            <div className="flex-1">
              <h1 className="text-[14px] font-semibold">Provenance</h1>
              <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[480px]">{repo?.full_name}</p>
            </div>
            <Link
              href={`/repository/${params.id}/walkthrough${filePath ? `?file=${encodeURIComponent(filePath)}` : ''}`}
              className="text-[12px] font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Walkthrough
            </Link>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-10 max-w-[1100px] mx-auto">
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="w-full lg:w-80 flex-shrink-0">
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]/70 overflow-hidden h-[420px] lg:h-[calc(100vh-200px)]">
                {isLoadingTree ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                ) : fileTree.length === 0 ? (
                  <div className="h-full flex items-center justify-center px-4 text-center">
                    <p className="text-[14px] text-[var(--text-muted)]">
                      {repo?.is_indexed ? 'No files found' : 'Index the repository to browse files'}
                    </p>
                  </div>
                ) : (
                  <FileExplorer
                    files={explorerFiles}
                    selectedFile={filePath}
                    onSelectFile={(path) => {
                      userPickedRef.current = true
                      setFilePath(path)
                    }}
                  />
                )}
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              {!githubOnly && repo ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 mb-8 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[14px] font-semibold text-amber-200">GitHub-only feature</p>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                      Provenance uses GitHub commit and PR history. Connect a GitHub repository to use this view.
                    </p>
                  </div>
                </div>
              ) : null}

              <motion.div
                className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 mb-10"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease }}
              >
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                      Selected file
                    </label>
                    <div className="w-full rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] px-3 py-2.5">
                      <span className="block font-mono text-[13px] text-[var(--text-primary)] break-all">
                        {filePath || 'Select a file from the tree'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                      Symbol (optional)
                    </label>
                    <input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      placeholder="e.g. handleRequest"
                      className="w-full rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] px-3 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading || !githubOnly || !filePath}
                    onClick={() => runQuery(false)}
                    className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.25)] disabled:opacity-40 transition-all"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate Why
                  </button>
                  <button
                    type="button"
                    disabled={loading || !githubOnly || !filePath}
                    onClick={() => runQuery(true)}
                    className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] font-semibold text-[13px] px-4 py-2.5 rounded-full disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                  {fromCache && card ? (
                    <span className="text-[12px] text-[var(--text-muted)] self-center ml-2">Served from cache</span>
                  ) : null}
                </div>
              </motion.div>

              {error && repo ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[14px] px-4 py-3 mb-6">
                  {error}
                </div>
              ) : null}

              {card ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease }}
                  className="rounded-2xl border border-[var(--card-border)] bg-[var(--hover-bg)]/40 p-6 md:p-8"
                >
                  <ProvenanceCardView card={card} onFeedback={githubOnly ? handleFeedback : undefined} />
                </motion.div>
              ) : (
                !loading && (
                  <p className="text-[14px] text-[var(--text-muted)] text-center py-16">
                    Run <span className="text-[var(--text-primary)] font-medium">Generate Why</span> to build a provenance card from GitHub history and your code.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

type ExplorerNode = {
  id: string
  path: string
  name: string
  isDirectory: boolean
  language?: string
  children?: ExplorerNode[]
}

function adaptFileTree(nodes: FileNode[]): ExplorerNode[] {
  return nodes.map((n) => ({
    id: n.id || n.path,
    path: n.path,
    name: n.name,
    isDirectory: (n as any).is_directory,
    language: (n as any).language || undefined,
    children: n.children ? adaptFileTree(n.children) : undefined,
  }))
}

function findFirstFile(nodes: FileNode[]): FileNode | null {
  for (const n of nodes) {
    if (!(n as any).is_directory) return n
    if (n.children?.length) {
      const found = findFirstFile(n.children)
      if (found) return found
    }
  }
  return null
}
