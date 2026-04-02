'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer'
import { FileExplorer } from '@/components/walkthrough/FileExplorer'
import { DiagramPanel } from '@/components/walkthrough/DiagramPanel'
import { SandboxPanel } from '@/components/walkthrough/SandboxPanel'
import { ImpactPanel } from '@/components/walkthrough/ImpactPanel'
import {
  ArrowLeft,
  Layers,
  FileCode,
  GitBranch,
  Terminal,
  Loader2,
  Sparkles,
  AlertCircle,
  Zap,
  X,
  History,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import { files, walkthroughs, repositories, FileNode, WalkthroughScript, Repository } from '@/lib/api'
import toast from 'react-hot-toast'

type PanelType = 'files' | 'diagram' | 'sandbox' | 'impact'

/** Adapt API FileNode shape (is_directory) to component shape (isDirectory) */
function adaptFileTree(nodes: FileNode[]): any[] {
  return nodes.map((n) => ({
    id: n.id || n.path,
    path: n.path,
    name: n.name,
    isDirectory: n.is_directory,
    language: n.language ?? undefined,
    children: n.children ? adaptFileTree(n.children) : undefined,
  }))
}

export default function WalkthroughPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const fileFromQuery = searchParams.get('file')

  const [repo, setRepo] = useState<Repository | null>(null)
  const [fileTree, setFileTree] = useState<any[]>([])
  const [selectedFile, setSelectedFile] = useState<string>(fileFromQuery || '')
  const [codeContent, setCodeContent] = useState<string>('')
  const [script, setScript] = useState<WalkthroughScript | null>(null)
  const [activePanel, setActivePanel] = useState<PanelType>('files')
  const [isPlaying, setIsPlaying] = useState(false)

  // Loading states
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isLoadingCode, setIsLoadingCode] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<'diagram' | 'sandbox' | null>(null)

  // Fetch repo & file tree on mount
  useEffect(() => {
    async function load() {
      setIsLoadingTree(true)
      try {
        const [repoData, tree] = await Promise.all([
          repositories.get(params.id),
          files.getTree(params.id),
        ])
        setRepo(repoData)
        setFileTree(adaptFileTree(tree))

        // Auto-select first non-directory file if none selected
        if (!fileFromQuery) {
          const first = findFirstFile(tree)
          if (first) setSelectedFile(first.path)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repository')
      } finally {
        setIsLoadingTree(false)
      }
    }
    load()
  }, [params.id, fileFromQuery])

  // Fetch code and check for existing walkthrough when selected file changes
  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false

    async function loadCodeAndWalkthrough() {
      setIsLoadingCode(true)
      setScript(null)
      try {
        // Fetch code content and existing walkthroughs in parallel
        const [content, existingWalkthroughs] = await Promise.all([
          files.getContent(params.id, selectedFile),
          walkthroughs.getForFile(params.id, selectedFile).catch(() => [] as WalkthroughScript[]),
        ])

        if (cancelled) return

        setCodeContent(content)

        // Auto-load the most recent existing walkthrough if available
        if (existingWalkthroughs.length > 0) {
          const latest = existingWalkthroughs[existingWalkthroughs.length - 1]
          setScript(latest)
        }
      } catch {
        if (!cancelled) setCodeContent('// Failed to load file content')
      } finally {
        if (!cancelled) setIsLoadingCode(false)
      }
    }
    loadCodeAndWalkthrough()
    return () => { cancelled = true }
  }, [selectedFile, params.id])

  const handleGenerate = useCallback(async () => {
    if (!selectedFile) return
    setIsGenerating(true)
    setIsPlaying(false)
    try {
      const result = await walkthroughs.generate(params.id, selectedFile, 'developer')
      // Adapt snake_case from API to camelCase for WalkthroughPlayer
      setScript({
        ...result,
        segments: result.segments.map((seg) => ({
          ...seg,
        })),
      })
      toast.success('Walkthrough generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate walkthrough')
    } finally {
      setIsGenerating(false)
    }
  }, [selectedFile, params.id])

  // Map WalkthroughScript (snake_case) to the camelCase shape WalkthroughPlayer expects
  const playerScript = script
    ? {
      id: script.id,
      filePath: script.file_path,
      title: script.title,
      summary: script.summary,
      totalDuration: script.total_duration,
      segments: script.segments.map((s) => ({
        id: s.id,
        order: s.order,
        text: s.text,
        startLine: s.start_line,
        endLine: s.end_line,
        highlightLines: s.highlight_lines,
        durationEstimate: s.duration_estimate,
      })),
    }
    : null

  // Loading state
  if (isLoadingTree) {
    return (
      <div className="h-screen bg-dv-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-dv-accent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen bg-dv-bg flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-dv-error mx-auto mb-3" />
          <p className="text-sm text-dv-error mb-4">{error}</p>
          <Link href={`/repository/${params.id}`} className="btn-secondary">Back to Repository</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[var(--page-bg)] flex flex-col">
      {/* Header — frosted glass */}
      <header className="flex items-center justify-between px-6 h-14 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/repository/${params.id}`}
            className="p-1.5 rounded-[10px] hover:bg-[var(--input-bg)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[8px] bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
              <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{repo?.name || 'Repository'}</h1>
              <p className="text-[11px] text-[var(--text-secondary)] truncate max-w-[200px]">{selectedFile || 'Select a file'}</p>
            </div>
          </div>
        </div>

        {repo?.source === 'github' && selectedFile && (
          <Link
            href={`/repository/${params.id}/provenance?file=${encodeURIComponent(selectedFile)}`}
            className="hidden sm:inline-flex items-center gap-1.5 text-[12px] font-semibold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 mr-2"
          >
            <History className="w-3.5 h-3.5" />
            Why
          </Link>
        )}
        <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
          <PanelButton
            active={activePanel === 'files'}
            onClick={() => setActivePanel('files')}
            icon={<FileCode className="w-3.5 h-3.5" />}
            label="Files"
          />
          <PanelButton
            active={activePanel === 'diagram'}
            onClick={() => setActivePanel('diagram')}
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Diagram"
          />
          <PanelButton
            active={activePanel === 'sandbox'}
            onClick={() => setActivePanel('sandbox')}
            icon={<Terminal className="w-3.5 h-3.5" />}
            label="Sandbox"
          />
          <PanelButton
            active={activePanel === 'impact'}
            onClick={() => setActivePanel('impact')}
            icon={<Zap className="w-3.5 h-3.5" />}
            label="Impact"
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Impact takes the full page when active */}
        {activePanel === 'impact' ? (
          <div className="flex-1 overflow-hidden">
            <ImpactPanel repositoryId={params.id} filePath={selectedFile} fullName={repo?.full_name} />
          </div>
        ) : (
          <>
            {/* Side panel */}
            <motion.div
              className="w-72 border-r border-[var(--card-border)] bg-[var(--card-bg)]/80 backdrop-blur-xl overflow-hidden flex-shrink-0"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
            >
              {activePanel === 'files' && (
                <FileExplorer
                  files={fileTree}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                />
              )}
              {activePanel === 'diagram' && (
                <DiagramPanel repositoryId={params.id} filePath={selectedFile} onExpand={() => setExpandedPanel('diagram')} />
              )}
              {activePanel === 'sandbox' && (
                <SandboxPanel onExpand={() => setExpandedPanel('sandbox')} />
              )}
            </motion.div>

            {/* Walkthrough player or generate prompt */}
            <div className="flex-1 overflow-hidden relative">
              {isLoadingCode ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-dv-accent animate-spin mr-3" />
                  <span className="text-sm text-dv-text-muted">Loading file…</span>
                </div>
              ) : !playerScript ? (
                <div className="h-full flex flex-col items-center justify-center px-8 relative">
                  {/* Subtle ambient glow */}
                  <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] bg-purple-500/[0.04] rounded-full blur-[80px] pointer-events-none" />
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/15 to-indigo-500/15 border border-purple-500/10 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(168,85,247,0.08)]">
                      <Sparkles className="w-7 h-7 text-purple-400" />
                    </div>
                    <h2 className="text-[22px] font-bold tracking-[-0.02em] mb-2 text-center text-[var(--text-primary)]">Generate a Walkthrough</h2>
                    <p className="text-[14px] text-[var(--text-secondary)] text-center max-w-md mb-8 leading-relaxed">
                      AI will analyze <span className="text-[var(--text-primary)] font-semibold">{selectedFile.split('/').pop()}</span> and create
                      a narrated, step-by-step code walkthrough with voice.
                    </p>
                    <div className="flex justify-center">
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !selectedFile}
                        className="inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[14px] px-7 py-3 rounded-full hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Walkthrough
                          </>
                        )}
                      </button>
                    </div>
                    {codeContent && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-5 text-center font-mono">
                        {codeContent.split('\n').length} lines · {selectedFile.split('.').pop()?.toUpperCase()}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <WalkthroughPlayer
                  code={codeContent}
                  script={playerScript}
                  filePath={selectedFile}
                  isPlaying={isPlaying}
                  onPlayingChange={setIsPlaying}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Fullscreen overlay for Diagram / Sandbox */}
      <AnimatePresence>
        {expandedPanel && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-dv-bg/80 backdrop-blur-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Close bar */}
            <div className="flex items-center justify-between px-6 h-12 border-b border-dv-border flex-shrink-0">
              <span className="text-sm font-semibold tracking-[-0.01em] text-dv-text/90">
                {expandedPanel === 'diagram' ? 'Diagram' : 'Sandbox'}
              </span>
              <button
                onClick={() => setExpandedPanel(null)}
                className="p-1.5 rounded-[8px] hover:bg-[var(--glass-8)] transition-colors active:scale-[0.92]"
              >
                <X className="w-4 h-4 text-dv-text/70" />
              </button>
            </div>

            {/* Full-size panel */}
            <div className="flex-1 overflow-hidden">
              {expandedPanel === 'diagram' && (
                <DiagramPanel repositoryId={params.id} filePath={selectedFile} />
              )}
              {expandedPanel === 'sandbox' && (
                <SandboxPanel />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PanelButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold flex items-center gap-1.5 transition-all',
        active
          ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/** Walk the tree and return the first non-directory node */
function findFirstFile(nodes: FileNode[]): FileNode | null {
  for (const n of nodes) {
    if (!n.is_directory) return n
    if (n.children?.length) {
      const found = findFirstFile(n.children)
      if (found) return found
    }
  }
  return null
}

