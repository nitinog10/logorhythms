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

const ease = [0.23, 1, 0.32, 1] as const

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

  const mermaidCode =
    mode === 'codebase' ? codebaseImpact?.impact_mermaid : impact?.impact_mermaid

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return
    renderMermaid(mermaidCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mermaidCode])

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
          `<div class="flex flex-col items-center gap-2 py-8"><p class="text-[13px] text-red-400">Could not render impact graph</p><pre class="text-[11px] text-[var(--text-secondary)] bg-[var(--input-bg)] p-3 rounded-xl max-w-xl overflow-auto max-h-40">${code}</pre></div>`
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
    if (isSpeaking) { stopBrief(); return }
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
      ? { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' }
      : level === 'medium'
      ? { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' }
      : { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' }

  const riskClasses = (level: string) => {
    const c = riskColor(level)
    return `${c.bg} ${c.text} ${c.border}`
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--page-bg)] relative">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[10%] w-[500px] h-[400px] bg-orange-500/[0.03] rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[300px] bg-red-500/[0.02] rounded-full blur-[120px]" />
      </div>

      {/* ── Frosted toolbar ── */}
      <div className="relative z-10 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Change Impact</h2>
              <p className="text-[11px] text-[var(--text-muted)] tracking-[-0.01em]">
                {mode === 'codebase' ? 'Full codebase analysis' : filePath.split('/').pop() || 'Select a file'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
              <button
                onClick={() => setMode('codebase')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                  mode === 'codebase'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                Codebase
              </button>
              <button
                onClick={() => setMode('file')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                  mode === 'file'
                    ? 'bg-[var(--input-border)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
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
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runFileAnalysis()
                    }}
                    placeholder="Symbol (optional)"
                    className="w-44 pl-8 pr-3 py-1.5 text-[12px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-orange-500/25 focus:border-orange-500/30 transition-all"
                  />
                </div>
                <button
                  onClick={() => runFileAnalysis()}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/15 transition-all disabled:opacity-40 active:scale-[0.97]"
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
                className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/15 transition-all disabled:opacity-40 active:scale-[0.97]"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            )}

            {/* Create Issue */}
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

      {/* ── Body ── */}
      <div className="relative z-[1] flex-1 overflow-y-auto">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center mb-4">
              <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
            </div>
            <span className="text-[14px] text-[var(--text-muted)]">
              Analyzing {mode === 'codebase' ? 'codebase' : 'file'} impact…
            </span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <motion.div
            className="mx-6 mt-6 flex items-start gap-3 p-4 rounded-2xl bg-red-500/8 border border-red-500/10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-400/80">{error}</p>
          </motion.div>
        )}

        {/* ============ CODEBASE MODE ============ */}
        {mode === 'codebase' && codebaseImpact && !isLoading && (
          <div className="px-6 py-8 space-y-6 max-w-[1100px] mx-auto">

            {/* Risk badge + score */}
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
                <span className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">{codebaseImpact.overall_risk_score}</span>
                <span className="text-[13px] text-[var(--text-muted)]">/100</span>
              </div>
            </motion.div>

            {/* Stat cards */}
            <motion.div
              className="grid grid-cols-4 gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease }}
            >
              <StatCard label="Source Files" value={codebaseImpact.total_files} icon={<FileCode className="w-[18px] h-[18px]" />} color="#6366f1" />
              <StatCard label="Dependencies" value={codebaseImpact.total_dependencies} icon={<Network className="w-[18px] h-[18px]" />} color="#ff9f0a" />
              <StatCard label="Components" value={codebaseImpact.connected_components} icon={<Layers className="w-[18px] h-[18px]" />} color="#a855f7" />
              <StatCard label="Is DAG" value={codebaseImpact.is_dag ? 'Yes' : 'No'} icon={<Shield className="w-[18px] h-[18px]" />} color={codebaseImpact.is_dag ? '#30d158' : '#ff453a'} />
            </motion.div>

            {/* Brief + Recommended Actions */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
            >
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Codebase Brief</h3>
                  <button
                    onClick={toggleBrief}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/15 transition-all active:scale-[0.95]"
                  >
                    {isSpeaking ? (
                      <><Pause className="w-3 h-3" /> Stop</>
                    ) : (
                      <><Play className="w-3 h-3" /> Listen</>
                    )}
                  </button>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {codebaseImpact.brief_script}
                </p>
              </GlassCard>

              <GlassCard>
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">Recommended Actions</h3>
                <ol className="space-y-2.5">
                  {codebaseImpact.recommended_actions.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                {fullName && codebaseImpact.recommended_actions.length > 0 && (() => {
                  const [owner, repo] = fullName.split('/')
                  return owner && repo ? (
                    <div className="mt-4 pt-4 border-t border-[var(--text-faint)]">
                      <ImplementFixButton
                        owner={owner}
                        repo={repo}
                        suggestions={codebaseImpact.recommended_actions}
                        impactSummary={codebaseImpact.brief_script}
                      />
                    </div>
                  ) : null
                })()}
              </GlassCard>
            </motion.div>

            {/* Hotspots + Most Imported */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease }}
            >
              {codebaseImpact.hotspots.length > 0 && (
                <ListCard title="Hotspot Files" count={codebaseImpact.hotspots.length}>
                  {codebaseImpact.hotspots.map((hs, i) => (
                    <ListRow key={hs.file} isLast={i === codebaseImpact.hotspots.length - 1}>
                      <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate flex-1 mr-3">{hs.file}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[11px] text-[var(--text-faint)]">{hs.direct_dependents}d / {hs.total_affected}a</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${riskClasses(hs.risk_level)}`}>
                          {hs.risk_score}
                        </span>
                      </div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
              {codebaseImpact.most_imported.length > 0 && (
                <ListCard title="Most Imported">
                  {codebaseImpact.most_imported.map((m, i) => (
                    <ListRow key={m.file} isLast={i === codebaseImpact.most_imported.length - 1}>
                      <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate flex-1 mr-3">{m.file}</span>
                      <span className="text-[11px] text-indigo-400 font-semibold whitespace-nowrap">{m.import_count} imports</span>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </motion.div>

            {/* Circular deps */}
            {codebaseImpact.circular_dependencies.length > 0 && (
              <motion.div
                className="rounded-2xl bg-orange-500/[0.04] border border-orange-500/10 p-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2, ease }}
              >
                <h3 className="text-[13px] font-semibold text-orange-400 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Circular Dependencies
                  <span className="text-[11px] font-normal text-orange-400/50">{codebaseImpact.circular_dependencies.length}</span>
                </h3>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {codebaseImpact.circular_dependencies.map((cycle, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12px] text-orange-400/60 font-mono">
                      {cycle.map((item, j) => (
                        <span key={j} className="flex items-center gap-1.5">
                          {j > 0 && <ArrowRight className="w-3 h-3 text-orange-400/30" />}
                          <span>{item}</span>
                        </span>
                      ))}
                      <ArrowRight className="w-3 h-3 text-orange-400/30" />
                      <span>{cycle[0]}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Graph */}
            <motion.div
              className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease }}
            >
              <div className="px-5 py-3.5 border-b border-[var(--text-faint)] flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-orange-400" />
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Codebase Impact Graph</h3>
              </div>
              {graphStatus === 'rendering' && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-orange-400 animate-spin mr-2.5" />
                  <span className="text-[13px] text-[var(--text-muted)]">Rendering graph…</span>
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

            {/* Risk badge + score + symbol */}
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
                <span className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">{impact.risk_score}</span>
                <span className="text-[13px] text-[var(--text-muted)]">/100</span>
              </div>
              {impact.symbol_context && (
                <span className="ml-auto text-[12px] text-[var(--text-muted)]">
                  {impact.symbol_context.type}: <span className="text-[var(--text-secondary)] font-medium">{impact.symbol_context.name}</span>
                </span>
              )}
            </motion.div>

            {/* Stats */}
            <motion.div
              className="grid grid-cols-4 gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease }}
            >
              <StatCard label="Direct Dependents" value={impact.direct_dependents.length} icon={<GitBranch className="w-[18px] h-[18px]" />} color="#6366f1" />
              <StatCard label="Total Affected" value={impact.total_affected} icon={<Network className="w-[18px] h-[18px]" />} color="#ff9f0a" />
            </motion.div>

            {/* Brief + Refactor Steps */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
            >
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Impact Brief</h3>
                  <button
                    onClick={toggleBrief}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/15 transition-all active:scale-[0.95]"
                  >
                    {isSpeaking ? (
                      <><Pause className="w-3 h-3" /> Stop</>
                    ) : (
                      <><Play className="w-3 h-3" /> Listen</>
                    )}
                  </button>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {impact.brief_script}
                </p>
              </GlassCard>

              <GlassCard>
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">Recommended Refactor Steps</h3>
                <ol className="space-y-2.5">
                  {impact.recommended_refactor_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                {fullName && impact.recommended_refactor_steps.length > 0 && (() => {
                  const [owner, repo] = fullName.split('/')
                  return owner && repo ? (
                    <div className="mt-4 pt-4 border-t border-[var(--text-faint)]">
                      <ImplementFixButton
                        owner={owner}
                        repo={repo}
                        suggestions={impact.recommended_refactor_steps}
                        impactSummary={`File: ${impact.target_file}, Risk: ${impact.risk_score}/100`}
                      />
                    </div>
                  ) : null
                })()}
              </GlassCard>
            </motion.div>

            {/* Circular deps */}
            {impact.circular_dependencies.length > 0 && (
              <motion.div
                className="rounded-2xl bg-orange-500/[0.04] border border-orange-500/10 p-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15, ease }}
              >
                <h3 className="text-[13px] font-semibold text-orange-400 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Circular Dependencies
                </h3>
                <ul className="space-y-1.5">
                  {impact.circular_dependencies.map((cycle, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[12px] text-orange-400/60 font-mono">
                      {cycle.map((item, j) => (
                        <span key={j} className="flex items-center gap-1.5">
                          {j > 0 && <ArrowRight className="w-3 h-3 text-orange-400/30" />}
                          <span>{item}</span>
                        </span>
                      ))}
                      <ArrowRight className="w-3 h-3 text-orange-400/30" />
                      <span>{cycle[0]}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Dependents + Affected files */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease }}
            >
              {impact.direct_dependents.length > 0 && (
                <ListCard title="Direct Dependents" count={impact.direct_dependents.length}>
                  {impact.direct_dependents.map((dep, i) => (
                    <ListRow key={dep} isLast={i === impact.direct_dependents.length - 1}>
                      <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate">{dep}</span>
                    </ListRow>
                  ))}
                </ListCard>
              )}
              {impact.affected_files.length > 0 && (
                <ListCard title="All Affected Files" count={impact.affected_files.length}>
                  {impact.affected_files.map((f, i) => (
                    <ListRow key={f} isLast={i === impact.affected_files.length - 1}>
                      <span className="text-[12px] text-[var(--text-secondary)] font-mono truncate">{f}</span>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </motion.div>

            {/* Graph */}
            <motion.div
              className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease }}
            >
              <div className="px-5 py-3.5 border-b border-[var(--text-faint)] flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-orange-400" />
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Impact Graph</h3>
              </div>
              {graphStatus === 'rendering' && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-orange-400 animate-spin mr-2.5" />
                  <span className="text-[13px] text-[var(--text-muted)]">Rendering graph…</span>
                </div>
              )}
              <div
                ref={containerRef}
                className="w-full min-h-[420px] overflow-auto p-4 [&_svg]:w-full [&_svg]:min-h-[400px] [&_svg]:h-auto"
              />
            </motion.div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error
          && ((mode === 'file' && !impact) || (mode === 'codebase' && !codebaseImpact)) && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(255,159,10,0.08)]">
              <Zap className="w-8 h-8 text-orange-400/40" />
            </div>
            <p className="text-[15px] font-semibold text-[var(--text-secondary)] mb-2">
              {mode === 'codebase' ? 'Codebase Analysis' : 'File Analysis'}
            </p>
            <p className="text-[13px] text-[var(--text-muted)] max-w-sm">
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

/* ── Glass Card ── */
function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
      {children}
    </div>
  )
}

/* ── List Card ── */
function ListCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--text-faint)]">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {title}
          {count != null && <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{count}</span>}
        </h3>
      </div>
      <div className="max-h-72 overflow-y-auto">{children}</div>
    </div>
  )
}

/* ── List Row ── */
function ListRow({ children, isLast }: { children: React.ReactNode; isLast: boolean }) {
  return (
    <div className={`flex items-center justify-between px-5 py-2.5 hover:bg-[var(--hover-bg)] transition-colors ${
      !isLast ? 'border-b border-[var(--text-faint)]' : ''
    }`}>
      {children}
    </div>
  )
}

/* ── Stat Card ── */
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
    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}20` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-[24px] font-bold tracking-[-0.03em]" style={{ color }}>{value}</p>
    </div>
  )
}
