'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  BarChart3,
  FileCode,
  GitBranch,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Zap,
  Shield,
  Network,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { files, ImpactAnalysis, CodebaseImpact } from '@/lib/api'
import { CreateIssueButton } from '@/components/github/CreateIssueButton'
import { ImplementFixButton } from '@/components/github/ImplementFixButton'

const ease = [0.25, 0.1, 0.25, 1] as const

type AnalysisMode = 'file' | 'codebase'

interface ImpactPanelProps {
  repositoryId: string
  filePath: string
  fullName?: string
}

export function ImpactPanel({ repositoryId, filePath, fullName }: ImpactPanelProps) {
  const [mode, setMode] = useState<AnalysisMode>('codebase')
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null)
  const [codebaseImpact, setCodebaseImpact] = useState<CodebaseImpact | null>(null)
  const [symbol, setSymbol] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [graphStatus, setGraphStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const containerRef = useRef<HTMLDivElement>(null)
  const renderCountRef = useRef(0)

  /* =========== file-level analysis =========== */
  const runFileAnalysis = async (symbolOverride?: string) => {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    setGraphStatus('idle')
    try {
      const resolvedSymbol = (symbolOverride ?? symbol).trim()
      const result = await files.getImpact(
        repositoryId,
        filePath,
        resolvedSymbol ? resolvedSymbol : undefined
      )
      setImpact(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze impact')
      setImpact(null)
    } finally {
      setIsLoading(false)
    }
  }

  /* =========== codebase-level analysis =========== */
  const runCodebaseAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    setGraphStatus('idle')
    try {
      const result = await files.getCodebaseImpact(repositoryId)
      setCodebaseImpact(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze codebase')
      setCodebaseImpact(null)
    } finally {
      setIsLoading(false)
    }
  }

  /* auto-run on mount / mode change */
  useEffect(() => {
    stopBrief()
    if (mode === 'codebase') {
      setImpact(null)
      runCodebaseAnalysis()
    } else {
      setCodebaseImpact(null)
      setSymbol('')
      runFileAnalysis('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId, filePath, mode])

  /* mermaid render */
  const mermaidCode =
    mode === 'codebase' ? codebaseImpact?.impact_mermaid : impact?.impact_mermaid

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return
    renderMermaid(mermaidCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mermaidCode])

  // Re-render mermaid when theme changes
  useEffect(() => {
    const html = document.documentElement
    const observer = new MutationObserver(() => {
      if (mermaidCode) renderMermaid(mermaidCode)
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mermaidCode])

  useEffect(() => {
    return () => stopBrief()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderMermaid = async (code: string) => {
    if (!containerRef.current) {
      await new Promise((r) => requestAnimationFrame(r))
      if (!containerRef.current) return
    }
    containerRef.current.innerHTML = ''
    setGraphStatus('rendering')

    const isLight = document.documentElement.classList.contains('light')

    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: isLight ? 'default' : 'dark',
        securityLevel: 'loose',
        themeVariables: isLight
          ? {
              primaryColor: '#ff9f0a',
              primaryTextColor: '#1c1917',
              primaryBorderColor: '#ff9f0a',
              lineColor: 'rgba(0,0,0,0.15)',
              secondaryColor: '#f5f5f4',
              tertiaryColor: '#fafaf9',
              background: '#ffffff',
              mainBkg: '#f5f5f4',
              nodeBorder: 'rgba(0,0,0,0.1)',
              clusterBkg: 'rgba(255,149,0,0.06)',
              clusterBorder: 'rgba(255,149,0,0.15)',
              titleColor: '#1c1917',
              edgeLabelBackground: '#f5f5f4',
              nodeTextColor: '#1c1917',
            }
          : {
              primaryColor: '#ff9f0a',
              primaryTextColor: '#ffffff',
              primaryBorderColor: '#ff9f0a',
              lineColor: 'rgba(255,255,255,0.15)',
              secondaryColor: '#1c1c1e',
              tertiaryColor: '#1c1c1e',
              background: '#000000',
              mainBkg: '#1c1c1e',
              nodeBorder: 'rgba(255,255,255,0.1)',
              clusterBkg: 'rgba(255,159,10,0.06)',
              clusterBorder: 'rgba(255,159,10,0.15)',
              titleColor: '#ffffff',
              edgeLabelBackground: '#1c1c1e',
              nodeTextColor: '#ffffff',
            },
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      })

      renderCountRef.current += 1
      const id = `impact-graph-${Date.now()}-${renderCountRef.current}`
      const { svg } = await mermaid.render(id, code)
      if (containerRef.current) {
        containerRef.current.innerHTML = svg
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.width = '100%'
          svgEl.style.minHeight = '380px'
          svgEl.style.height = 'auto'
          svgEl.removeAttribute('height')
        }
      }
      setGraphStatus('done')
    } catch (err) {
      console.error('Mermaid render failed:', err)
      setGraphStatus('error')
      if (containerRef.current) {
        containerRef.current.innerHTML =
          `<div class="flex flex-col items-center gap-2 py-8"><p class="text-[13px] text-dv-error">Could not render impact graph</p><pre class="text-[11px] text-dv-text/30 bg-[var(--glass-4)] p-3 rounded-xl max-w-xl overflow-auto max-h-40">${code}</pre></div>`
      }
    }
  }

  const currentBrief =
    mode === 'codebase' ? codebaseImpact?.brief_script : impact?.brief_script

  const stopBrief = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  const toggleBrief = () => {
    if (!currentBrief) return
    if (isSpeaking) {
      stopBrief()
      return
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const utterance = new SpeechSynthesisUtterance(currentBrief)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  const riskColor = (level: string) =>
    level === 'high'
      ? { bg: 'bg-dv-error/10', text: 'text-dv-error', border: 'border-dv-error/20' }
      : level === 'medium'
      ? { bg: 'bg-dv-orange/10', text: 'text-dv-orange', border: 'border-dv-orange/20' }
      : { bg: 'bg-dv-success/10', text: 'text-dv-success', border: 'border-dv-success/20' }

  const riskClasses = (level: string) => {
    const c = riskColor(level)
    return `${c.bg} ${c.text} ${c.border}`
  }

  /* =========== RENDER =========== */
  return (
    <div className="h-full flex flex-col overflow-hidden bg-dv-bg relative">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[10%] w-[500px] h-[400px] bg-dv-orange/[0.03] rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[300px] bg-dv-error/[0.02] rounded-full blur-[120px]" />
      </div>

      {/* -- Top toolbar � frosted glass -- */}
      <div className="relative z-10 bg-[var(--bar-bg)] backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-dv-border flex-shrink-0">
        <div className="flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-dv-orange/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-dv-orange" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Change Impact</h2>
              <p className="text-[11px] text-dv-text/25 tracking-[-0.01em]">
                {mode === 'codebase' ? 'Full codebase analysis' : filePath.split('/').pop() || 'Select a file'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle � glass segmented */}
            <div className="flex items-center bg-[var(--glass-4)] border border-dv-border rounded-xl p-0.5">
              <button
                onClick={() => setMode('codebase')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                  mode === 'codebase'
                    ? 'bg-[var(--glass-10)] text-dv-text shadow-[var(--inset)]'
                    : 'text-dv-text/30 hover:text-dv-text/50'
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                Codebase
              </button>
              <button
                onClick={() => setMode('file')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                  mode === 'file'
                    ? 'bg-[var(--glass-10)] text-dv-text shadow-[var(--inset)]'
                    : 'text-dv-text/30 hover:text-dv-text/50'
                }`}
              >
                <FileCode className="w-3 h-3" />
                File
              </button>
            </div>

            {/* Symbol input (file mode) */}
            {mode === 'file' && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dv-text/20" />
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runFileAnalysis()
                    }}
                    placeholder="Symbol (optional)"
                    className="w-44 pl-8 pr-3 py-1.5 text-[12px] bg-[var(--glass-4)] border border-dv-border rounded-xl text-dv-text placeholder:text-dv-text/20 focus:outline-none focus:ring-1 focus:ring-dv-orange/25 focus:border-dv-orange/30 transition-all"
                  />
                </div>
                <button
                  onClick={() => runFileAnalysis()}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-xl bg-dv-orange/10 text-dv-orange hover:bg-dv-orange/15 transition-all disabled:opacity-40 active:scale-[0.97]"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Analyze
                </button>
              </div>
            )}

            {/* Refresh (codebase mode) */}
            {mode === 'codebase' && (
              <button
                onClick={runCodebaseAnalysis}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-xl bg-dv-orange/10 text-dv-orange hover:bg-dv-orange/15 transition-all disabled:opacity-40 active:scale-[0.97]"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            )}

            {/* GitHub: Create Issue */}
            {fullName && (impact || codebaseImpact) && (() => {
              const [owner, repo] = fullName.split('/')
              return owner && repo ? (
                <CreateIssueButton
                  owner={owner}
                  repo={repo}
                  impactData={impact}
                  codebaseData={codebaseImpact}
                  mode={mode}
                />
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* -- Body -- */}
      <div className="relative z-[1] flex-1 overflow-y-auto">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-dv-orange/10 flex items-center justify-center mb-4">
              <Loader2 className="w-6 h-6 text-dv-orange animate-spin" />
            </div>
            <span className="text-[14px] text-dv-text/25">
              Analyzing {mode === 'codebase' ? 'codebase' : 'file'} impact�
            </span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <motion.div
            className="mx-6 mt-6 flex items-start gap-3 p-4 rounded-2xl bg-dv-error/8 border border-dv-error/10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <AlertCircle className="w-5 h-5 text-dv-error flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-dv-error/80">{error}</p>
          </motion.div>
        )}

        {/* ============ CODEBASE MODE ============ */}
        {mode === 'codebase' && codebaseImpact && !isLoading && (
          <div className="px-6 py-8 space-y-6 max-w-[1100px] mx-auto">

            {/* -- Risk badge + score -- */}
            <motion.div
              className="flex items-center gap-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
            >
              <span
                className={`px-5 py-2 text-[12px] font-bold uppercase tracking-[0.05em] rounded-full border ${riskClasses(codebaseImpact.overall_risk_level)}`}
              >
                {codebaseImpact.overall_risk_level} risk
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-bold tracking-[-0.03em] text-dv-text">{codebaseImpact.overall_risk_score}</span>
                <span className="text-[13px] text-dv-text/25">/100</span>
              </div>
            </motion.div>

            {/* -- Stat cards � bento row -- */}
            <motion.div
              className="grid grid-cols-4 gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease }}
            >
              <StatCard label="Source Files" value={codebaseImpact.total_files} icon={<FileCode className="w-[18px] h-[18px]" />} color="#0a84ff" />
              <StatCard label="Dependencies" value={codebaseImpact.total_dependencies} icon={<Network className="w-[18px] h-[18px]" />} color="#ff9f0a" />
              <StatCard label="Components" value={codebaseImpact.connected_components} icon={<Layers className="w-[18px] h-[18px]" />} color="#bf5af2" />
              <StatCard label="Is DAG" value={codebaseImpact.is_dag ? 'Yes' : 'No'} icon={<Shield className="w-[18px] h-[18px]" />} color={codebaseImpact.is_dag ? '#30d158' : '#ff453a'} />
            </motion.div>

            {/* -- Brief + Recommended Actions -- */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
            >
              {/* Brief */}
              <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-5 shadow-[var(--inset)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-dv-text/90">Codebase Brief</h3>
                  <button
                    onClick={toggleBrief}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-lg bg-dv-orange/10 text-dv-orange hover:bg-dv-orange/15 transition-all active:scale-[0.95]"
                  >
                    {isSpeaking ? (
                      <><Pause className="w-3 h-3" /> Stop</>
                    ) : (
                      <><Play className="w-3 h-3" /> Listen</>
                    )}
                  </button>
                </div>
                <p className="text-[13px] text-dv-text/35 leading-relaxed">
                  {codebaseImpact.brief_script}
                </p>
              </div>

              {/* Recommended actions */}
              <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-5 shadow-[var(--inset)]">
                <h3 className="text-[13px] font-semibold text-dv-text/90 mb-4">Recommended Actions</h3>
                <ol className="space-y-2.5">
                  {codebaseImpact.recommended_actions.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-dv-orange/10 text-dv-orange text-[10px] flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-dv-text/35 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                {fullName && codebaseImpact.recommended_actions.length > 0 && (() => {
                  const [owner, repo] = fullName.split('/')
                  return owner && repo ? (
                    <div className="mt-4 pt-4 border-t border-dv-border-subtle">
                      <ImplementFixButton
                        owner={owner}
                        repo={repo}
                        suggestions={codebaseImpact.recommended_actions}
                        impactSummary={codebaseImpact.brief_script}
                      />
                    </div>
                  ) : null
                })()}
              </div>
            </motion.div>

            {/* -- Hotspots + Most Imported -- */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease }}
            >
              {/* Hotspot files */}
              {codebaseImpact.hotspots.length > 0 && (
                <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]">
                  <div className="px-5 py-3.5 border-b border-dv-border-subtle">
                    <h3 className="text-[13px] font-semibold text-dv-text/90">
                      Hotspot Files
                      <span className="ml-2 text-[11px] font-normal text-dv-text/20">{codebaseImpact.hotspots.length}</span>
                    </h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {codebaseImpact.hotspots.map((hs, i) => (
                      <div
                        key={hs.file}
                        className={`flex items-center justify-between px-5 py-2.5 hover:bg-[var(--glass-3)] transition-colors ${
                          i < codebaseImpact.hotspots.length - 1 ? 'border-b border-dv-border-subtle' : ''
                        }`}
                      >
                        <span className="text-[12px] text-dv-text/35 font-mono truncate flex-1 mr-3">
                          {hs.file}
                        </span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-[11px] text-dv-text/20">
                            {hs.direct_dependents}d / {hs.total_affected}a
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${riskClasses(hs.risk_level)}`}
                          >
                            {hs.risk_score}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Most imported */}
              {codebaseImpact.most_imported.length > 0 && (
                <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]">
                  <div className="px-5 py-3.5 border-b border-dv-border-subtle">
                    <h3 className="text-[13px] font-semibold text-dv-text/90">Most Imported</h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {codebaseImpact.most_imported.map((m, i) => (
                      <div
                        key={m.file}
                        className={`flex items-center justify-between px-5 py-2.5 hover:bg-[var(--glass-3)] transition-colors ${
                          i < codebaseImpact.most_imported.length - 1 ? 'border-b border-dv-border-subtle' : ''
                        }`}
                      >
                        <span className="text-[12px] text-dv-text/35 font-mono truncate flex-1 mr-3">
                          {m.file}
                        </span>
                        <span className="text-[11px] text-dv-accent font-semibold whitespace-nowrap">{m.import_count} imports</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            {/* -- Circular deps -- */}
            {codebaseImpact.circular_dependencies.length > 0 && (
              <motion.div
                className="rounded-2xl bg-dv-orange/[0.04] border border-dv-orange/10 p-5 shadow-[inset_0_1px_0_rgba(255,159,10,0.04)]"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2, ease }}
              >
                <h3 className="text-[13px] font-semibold text-dv-orange mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Circular Dependencies
                  <span className="text-[11px] font-normal text-dv-orange/50">{codebaseImpact.circular_dependencies.length}</span>
                </h3>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {codebaseImpact.circular_dependencies.map((cycle, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12px] text-dv-orange/60 font-mono">
                      {cycle.map((item, j) => (
                        <span key={j} className="flex items-center gap-1.5">
                          {j > 0 && <ArrowRight className="w-3 h-3 text-dv-orange/30" />}
                          <span>{item}</span>
                        </span>
                      ))}
                      <ArrowRight className="w-3 h-3 text-dv-orange/30" />
                      <span>{cycle[0]}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* -- Graph -- */}
            <motion.div
              className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease }}
            >
              <div className="px-5 py-3.5 border-b border-dv-border-subtle flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-dv-orange" />
                <h3 className="text-[13px] font-semibold text-dv-text/90">Codebase Impact Graph</h3>
              </div>
              {graphStatus === 'rendering' && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-dv-orange animate-spin mr-2.5" />
                  <span className="text-[13px] text-dv-text/25">Rendering graph�</span>
                </div>
              )}
              <div
                ref={containerRef}
                className="w-full min-h-[420px] overflow-auto p-4 [&_svg]:w-full [&_svg]:min-h-[400px] [&_svg]:h-auto"
              />
            </motion.div>
          </div>
        )}

        {/* ============ FILE MODE ============ */}
        {mode === 'file' && impact && !isLoading && (
          <div className="px-6 py-8 space-y-6 max-w-[1100px] mx-auto">

            {/* -- Risk badge + score + symbol -- */}
            <motion.div
              className="flex items-center gap-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
            >
              <span
                className={`px-5 py-2 text-[12px] font-bold uppercase tracking-[0.05em] rounded-full border ${riskClasses(impact.risk_level)}`}
              >
                {impact.risk_level} risk
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-bold tracking-[-0.03em] text-dv-text">{impact.risk_score}</span>
                <span className="text-[13px] text-dv-text/25">/100</span>
              </div>
              {impact.symbol_context && (
                <span className="ml-auto text-[12px] text-dv-text/25">
                  {impact.symbol_context.type}: <span className="text-dv-text/60 font-medium">{impact.symbol_context.name}</span>
                </span>
              )}
            </motion.div>

            {/* -- Stats -- */}
            <motion.div
              className="grid grid-cols-4 gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease }}
            >
              <StatCard label="Direct Dependents" value={impact.direct_dependents.length} icon={<GitBranch className="w-[18px] h-[18px]" />} color="#0a84ff" />
              <StatCard label="Total Affected" value={impact.total_affected} icon={<Network className="w-[18px] h-[18px]" />} color="#ff9f0a" />
            </motion.div>

            {/* -- Brief + Refactor Steps -- */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
            >
              {/* Brief */}
              <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-5 shadow-[var(--inset)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-dv-text/90">Impact Brief</h3>
                  <button
                    onClick={toggleBrief}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-lg bg-dv-orange/10 text-dv-orange hover:bg-dv-orange/15 transition-all active:scale-[0.95]"
                  >
                    {isSpeaking ? (
                      <><Pause className="w-3 h-3" /> Stop</>
                    ) : (
                      <><Play className="w-3 h-3" /> Listen</>
                    )}
                  </button>
                </div>
                <p className="text-[13px] text-dv-text/35 leading-relaxed">
                  {impact.brief_script}
                </p>
              </div>

              {/* Refactor steps */}
              <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-5 shadow-[var(--inset)]">
                <h3 className="text-[13px] font-semibold text-dv-text/90 mb-4">Recommended Refactor Steps</h3>
                <ol className="space-y-2.5">
                  {impact.recommended_refactor_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-dv-orange/10 text-dv-orange text-[10px] flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-dv-text/35 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                {fullName && impact.recommended_refactor_steps.length > 0 && (() => {
                  const [owner, repo] = fullName.split('/')
                  return owner && repo ? (
                    <div className="mt-4 pt-4 border-t border-dv-border-subtle">
                      <ImplementFixButton
                        owner={owner}
                        repo={repo}
                        suggestions={impact.recommended_refactor_steps}
                        impactSummary={`File: ${impact.target_file}, Risk: ${impact.risk_score}/100`}
                      />
                    </div>
                  ) : null
                })()}
              </div>
            </motion.div>

            {/* -- Circular deps -- */}
            {impact.circular_dependencies.length > 0 && (
              <motion.div
                className="rounded-2xl bg-dv-orange/[0.04] border border-dv-orange/10 p-5 shadow-[inset_0_1px_0_rgba(255,159,10,0.04)]"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15, ease }}
              >
                <h3 className="text-[13px] font-semibold text-dv-orange mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Circular Dependencies
                </h3>
                <ul className="space-y-1.5">
                  {impact.circular_dependencies.map((cycle, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12px] text-dv-orange/60 font-mono">
                      {cycle.map((item, j) => (
                        <span key={j} className="flex items-center gap-1.5">
                          {j > 0 && <ArrowRight className="w-3 h-3 text-dv-orange/30" />}
                          <span>{item}</span>
                        </span>
                      ))}
                      <ArrowRight className="w-3 h-3 text-dv-orange/30" />
                      <span>{cycle[0]}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* -- Dependents + Affected files -- */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease }}
            >
              {/* Direct dependents */}
              {impact.direct_dependents.length > 0 && (
                <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]">
                  <div className="px-5 py-3.5 border-b border-dv-border-subtle">
                    <h3 className="text-[13px] font-semibold text-dv-text/90">
                      Direct Dependents
                      <span className="ml-2 text-[11px] font-normal text-dv-text/20">{impact.direct_dependents.length}</span>
                    </h3>
                  </div>
                  <ul className="max-h-60 overflow-y-auto">
                    {impact.direct_dependents.map((dep, i) => (
                      <li
                        key={dep}
                        className={`text-[12px] text-dv-text/35 font-mono truncate py-2.5 px-5 hover:bg-[var(--glass-3)] transition-colors ${
                          i < impact.direct_dependents.length - 1 ? 'border-b border-dv-border-subtle' : ''
                        }`}
                      >
                        {dep}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Affected files */}
              {impact.affected_files.length > 0 && (
                <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]">
                  <div className="px-5 py-3.5 border-b border-dv-border-subtle">
                    <h3 className="text-[13px] font-semibold text-dv-text/90">
                      All Affected Files
                      <span className="ml-2 text-[11px] font-normal text-dv-text/20">{impact.affected_files.length}</span>
                    </h3>
                  </div>
                  <ul className="max-h-60 overflow-y-auto">
                    {impact.affected_files.map((f, i) => (
                      <li
                        key={f}
                        className={`text-[12px] text-dv-text/35 font-mono truncate py-2.5 px-5 hover:bg-[var(--glass-3)] transition-colors ${
                          i < impact.affected_files.length - 1 ? 'border-b border-dv-border-subtle' : ''
                        }`}
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>

            {/* -- Graph -- */}
            <motion.div
              className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border overflow-hidden shadow-[var(--inset)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease }}
            >
              <div className="px-5 py-3.5 border-b border-dv-border-subtle flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-dv-orange" />
                <h3 className="text-[13px] font-semibold text-dv-text/90">Impact Graph</h3>
              </div>
              {graphStatus === 'rendering' && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-dv-orange animate-spin mr-2.5" />
                  <span className="text-[13px] text-dv-text/25">Rendering graph�</span>
                </div>
              )}
              <div
                ref={containerRef}
                className="w-full min-h-[420px] overflow-auto p-4 [&_svg]:w-full [&_svg]:min-h-[400px] [&_svg]:h-auto"
              />
            </motion.div>
          </div>
        )}

        {/* -- Empty state -- */}
        {!isLoading && !error
          && ((mode === 'file' && !impact) || (mode === 'codebase' && !codebaseImpact)) && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-dv-orange/10 flex items-center justify-center mb-5">
              <Zap className="w-8 h-8 text-dv-orange/40" />
            </div>
            <p className="text-[15px] font-semibold text-dv-text/50 mb-2">
              {mode === 'codebase' ? 'Codebase Analysis' : 'File Analysis'}
            </p>
            <p className="text-[13px] text-dv-text/25 max-w-sm">
              {mode === 'codebase'
                ? 'Analyze the entire codebase for impact hotspots and dependency risks.'
                : 'Select a file to analyze its change impact and dependency chain.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* -- Stat Card -- */
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border p-4 shadow-[var(--inset)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-dv-text/25 uppercase tracking-[0.06em]">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-[24px] font-bold tracking-[-0.03em]" style={{ color }}>{value}</p>
    </div>
  )
}
