'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Boxes,
  Cog,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Sparkles,
  Rocket,
  AlertTriangle,
  Lightbulb,
  Link2,
  Undo2,
  Redo2,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatPanel, type ChatPanelHandle } from '@/components/studio/ChatPanel'
import { PreviewCanvas } from '@/components/studio/PreviewCanvas'
import { InspectorTabs } from '@/components/studio/InspectorTabs'
import {
  studio,
  builder,
  type StudioSession,
  type BuilderProject,
  type StudioRuntimeMetrics,
  type StudioPendingChatAnchor,
} from '@/lib/api'
import {
  normalizeStudioPreviewUrl,
  isTrustedStudioPreviewIframeOrigin,
} from '@/lib/studioPreview'

export default function StudioWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = String(params?.id || '')

  const [session, setSession] = useState<StudioSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [bootstrapping, setBootstrapping] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [buildingMap, setBuildingMap] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showRuntimeDebug, setShowRuntimeDebug] = useState(false)
  const [runtimeMetrics, setRuntimeMetrics] = useState<StudioRuntimeMetrics | null>(null)
  const [runtimeMetricsLoading, setRuntimeMetricsLoading] = useState(false)
  const [runtimeMetricsError, setRuntimeMetricsError] = useState<string | null>(null)

  const [anchor, setAnchor] = useState<{
    dvId?: string | null
    tag?: string
    classes?: string
  } | null>(null)
  /** Matches preview toolbar: Pick for AI vs Use app — selection only applies while picking. */
  const [previewPickForAi, setPreviewPickForAi] = useState(true)

  /** Increment after applied file edits so iframe `src` changes and Next dev server reloads. */
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const chatPanelRef = useRef<ChatPanelHandle>(null)
  /** One-shot anchor from Components tab “Use in chat”. */
  const [pendingChatAnchor, setPendingChatAnchor] = useState<StudioPendingChatAnchor | null>(
    null
  )
  /** Increment when user stops preview so in-flight previewStatus polls cannot resurrect "running". */
  const previewPollEpochRef = useRef(0)

  const rawPreviewUrl = session?.runtime?.url ?? null
  const previewNorm = normalizeStudioPreviewUrl(rawPreviewUrl)
  const previewSrc = useMemo(() => {
    if (!previewNorm.src) return null
    try {
      const u = new URL(previewNorm.src)
      u.searchParams.set('__studio_reload', String(previewReloadNonce))
      return u.toString()
    } catch {
      const b = previewNorm.src
      return `${b}${b.includes('?') ? '&' : '?'}__studio_reload=${previewReloadNonce}`
    }
  }, [previewNorm.src, previewReloadNonce])
  const mixedContentBlocked = previewNorm.mixedContentBlocked
  const loadSession = useCallback(async () => {
    if (!sessionId) return
    try {
      const s = await studio.getSession(sessionId)
      setSession(s)
      setError(null)
    } catch (e: any) {
      // Bookmarks like /studio/builder_<hex> — resolve to real sess_* workspace
      if (e?.status === 404 && sessionId.startsWith('builder_')) {
        try {
          const list = await studio.listSessions()
          const existing = list.sessions.find(
            (x) => x.kind === 'generated' && x.source_id === sessionId
          )
          if (existing) {
            router.replace(`/studio/${existing.id}`)
            return
          }
          const created = await studio.createSession({
            kind: 'generated',
            source_id: sessionId,
          })
          router.replace(`/studio/${created.id}`)
          return
        } catch {
          setError(e?.message || 'Failed to open builder project in Studio')
        }
      } else {
        setError(e?.message || 'Failed to load session')
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId, router])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    function onEditApplied() {
      setAnchor(null)
      setPreviewReloadNonce((n) => n + 1)
    }
    window.addEventListener('studio:edit-applied', onEditApplied)
    return () => window.removeEventListener('studio:edit-applied', onEditApplied)
  }, [])

  // ── Click capture from iframe ───────────────────────────────────────────
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const isSameOrigin = ev.origin === window.location.origin
      if (!isSameOrigin && !isTrustedStudioPreviewIframeOrigin(ev.origin)) return

      const data = ev.data || {}
      if (data?.type !== 'element-click') return
      if (!sessionId) return

      const next = {
        dvId: data.dvId || null,
        tag: data.tag,
        classes: data.className,
      }
      setAnchor(next)

      // Persist click on the server (existing endpoint)
      const payload = {
        dv_id: data.dvId || null,
        dom: {
          tag: data.tag,
          id: data.id,
          className: data.className,
          parentTag: data.parentTag,
          computedStyle: data.computedStyle,
        },
        framework: data.framework || null,
      }
      studio.recordClick(sessionId, payload).catch(() => {})

      // Optimistically update local session so the inspector tab picks it up
      setSession((prev) =>
        prev
          ? {
              ...prev,
              last_inspected_node: {
                ts: new Date().toISOString(),
                event: payload as any,
              },
            }
          : prev
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sessionId])

  // ── Actions ─────────────────────────────────────────────────────────────
  const runBootstrap = async () => {
    if (!sessionId) return
    setBootstrapping(true)
    setError(null)
    try {
      const updated = await studio.bootstrap(sessionId)
      setSession(updated)
    } catch (e: any) {
      setError(e?.message || 'Bootstrap failed')
    } finally {
      setBootstrapping(false)
    }
  }

  const launchPreview = async () => {
    if (!sessionId) return
    setLaunching(true)
    setPreviewError(null)
    try {
      const r = await studio.launch(sessionId)
      if (r.error || r.status === 'error') {
        setPreviewError(r.error || 'Launch failed (no details)')
      }
      await loadSession()
    } catch (e: any) {
      setPreviewError(e?.message || 'Launch failed')
    } finally {
      setLaunching(false)
    }
  }

  const stopPreview = async () => {
    if (!sessionId) return
    previewPollEpochRef.current += 1
    setStopping(true)
    try {
      await studio.stop(sessionId)
      await loadSession()
    } catch (e: any) {
      setPreviewError(e?.message || 'Stop failed')
    } finally {
      setStopping(false)
    }
  }

  const buildSourceMap = async () => {
    if (!sessionId) return
    setBuildingMap(true)
    setError(null)
    try {
      const r = await studio.buildSourceMap(sessionId)
      toast.success(
        `Indexed ${r.elements_indexed} elements across ${r.files_visited} files.`
      )
      if (r.bridge?.warning) {
        toast(r.bridge.warning, { icon: 'ℹ️', duration: 6000 })
      }
      await loadSession()
    } catch (e: any) {
      toast.error(e?.message || 'Source map build failed')
    } finally {
      setBuildingMap(false)
    }
  }

  const loadRuntimeMetrics = useCallback(async () => {
    setRuntimeMetricsLoading(true)
    setRuntimeMetricsError(null)
    try {
      const m = await studio.runtimeMetrics()
      setRuntimeMetrics(m)
    } catch (e: any) {
      setRuntimeMetricsError(e?.message || 'Failed to load runtime metrics')
    } finally {
      setRuntimeMetricsLoading(false)
    }
  }, [])

  const [genProject, setGenProject] = useState<BuilderProject | null>(null)
  const [genProjectLoadError, setGenProjectLoadError] = useState<string | null>(null)
  const [genBusy, setGenBusy] = useState<'screens' | 'magic' | null>(null)

  const loadGenProject = useCallback(async () => {
    if (!session || session.kind !== 'generated') return
    try {
      const p = await builder.getProject(session.source_id)
      setGenProject(p)
      setGenProjectLoadError(null)
    } catch {
      setGenProject(null)
      setGenProjectLoadError((prev) => prev ?? 'Could not load project')
    }
  }, [session])

  // Initial + retry: App Studio project must exist before the strip can show counts.
  useEffect(() => {
    if (!session || session.kind !== 'generated') {
      setGenProject(null)
      setGenProjectLoadError(null)
      return
    }
    let cancelled = false
    const src = session.source_id

    ;(async () => {
      let loaded = false
      for (let i = 0; i < 24 && !cancelled; i++) {
        try {
          const p = await builder.getProject(src)
          if (!cancelled && p) {
            setGenProject(p)
            setGenProjectLoadError(null)
            loaded = true
            return
          }
        } catch {
          if (!cancelled) setGenProjectLoadError('Could not load App Studio project')
        }
        if (i < 23 && !cancelled) await new Promise((r) => setTimeout(r, 2000))
      }
      if (!cancelled && !loaded) {
        setGenProjectLoadError(
          'Could not load App Studio project. Refresh the page or check that the backend is running.'
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.id, session?.kind, session?.source_id])

  // While Stitch or Magic is running, the backend saves progress — poll for live counts.
  useEffect(() => {
    if (!session || session.kind !== 'generated' || !genProject) return
    const generatingProject = genProject.status === 'generating'
    const generatingScreen = (genProject.screens || []).some(
      (s) => s.status === 'generating'
    )
    const magicBuilding = genProject.magic_build_status === 'building'
    if (!genBusy && !generatingProject && !generatingScreen && !magicBuilding) return
    const id = window.setInterval(() => void loadGenProject(), 2500)
    return () => clearInterval(id)
  }, [session, genProject, genBusy, loadGenProject])

  const [deploying, setDeploying] = useState(false)
  const deploy = async () => {
    if (!sessionId) return
    setDeploying(true)
    const waitToast = toast.loading('Starting deploy to Vercel…')
    try {
      const r = await studio.deploy(sessionId)
      const depId = r.deployment_id
      if (!depId) {
        toast.dismiss(waitToast)
        toast.error('Vercel did not return a deployment id')
        return
      }
      toast.loading('Building on Vercel (may take several minutes)…', { id: waitToast })

      const maxPolls = 225
      for (let i = 0; i < maxPolls; i++) {
        const st = await studio.deployStatus(sessionId, depId)
        if (st.terminal) {
          toast.dismiss(waitToast)
          const ok = (st.readyState || '').toUpperCase() === 'READY'
          if (ok && st.url) {
            toast.success('Deployed — opening your site', { duration: 6000 })
            window.open(st.url, '_blank')
          } else if (ok && !st.url) {
            toast.error(
              'Build finished but Vercel did not return a URL. Open your project on vercel.com.',
              { duration: 8000 }
            )
          } else {
            toast.error(st.errorMessage || 'Deploy failed', { duration: 8000 })
          }
          return
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 4000))
      }
      toast.dismiss(waitToast)
      toast.error(
        'Still building after 15 minutes. Check progress on vercel.com',
        { duration: 8000 }
      )
    } catch (e: any) {
      toast.dismiss(waitToast)
      const detail = e?.data?.detail ?? e?.detail
      if (detail?.code === 'VERCEL_NOT_CONNECTED') {
        toast.error('Connect Vercel first in Settings → Integrations', {
          duration: 6000,
        })
        router.push('/settings/integrations')
      } else {
        toast.error(e?.message || 'Deploy failed')
      }
    } finally {
      setDeploying(false)
    }
  }

  // ── Poll preview status with backoff ────────────────────────────────────
  useEffect(() => {
    const status = session?.runtime?.status
    if (status !== 'starting' && status !== 'running') return

    let intervalMs = 2000
    let timerId: ReturnType<typeof setTimeout>

    const tick = async () => {
      const epochAtTick = previewPollEpochRef.current
      try {
        const s = await studio.previewStatus(sessionId)
        if (epochAtTick !== previewPollEpochRef.current) return
        intervalMs = 2000
        setSession((prev) =>
          prev
            ? {
                ...prev,
                runtime: {
                  ...prev.runtime,
                  status: s.status as any,
                  url: s.url ?? prev.runtime?.url,
                  port: s.port ?? prev.runtime?.port,
                  pid: s.pid ?? prev.runtime?.pid,
                },
              }
            : prev
        )
        if (s.status === 'stopped' || s.status === 'error') return
      } catch {
        intervalMs = Math.min(intervalMs * 2, 16000)
      }
      timerId = setTimeout(tick, intervalMs)
    }
    timerId = setTimeout(tick, intervalMs)
    return () => clearTimeout(timerId)
  }, [session?.runtime?.status, sessionId])

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen bg-[var(--bg)]">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading session...
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen bg-[var(--bg)]">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
              {error ? 'Couldn\'t open session' : 'Session not found'}
            </p>
            <p className="text-[12px] text-[var(--text-secondary)] mb-4">
              {error || 'It may have been deleted, or you don\'t have access.'}
            </p>
            <button
              onClick={() => router.push('/studio')}
              className="text-[12px] font-semibold text-dv-accent hover:underline"
            >
              Back to Studio
            </button>
          </div>
        </div>
      </div>
    )
  }

  const status = session.runtime?.status || 'stopped'
  const plan = session.bootstrap
  const isImported = session.kind === 'imported'
  const hasFullstack =
    !!genProject?.fullstack_files &&
    Object.keys(genProject.fullstack_files).length > 0
  const canLaunchPreview =
    session.kind === 'imported' ? !!plan : hasFullstack
  const branchLabel = String(session.branch_head ?? 'main')

  return (
    <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 px-4 flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--card-bg)]/60 backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => router.push('/studio')}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)]"
              title="Back to Studio"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Boxes className="w-4 h-4 text-dv-accent flex-shrink-0" />
            <span className="text-[13px] font-bold text-[var(--text-primary)] truncate">
              {session.title}
            </span>
            <KindBadge kind={session.kind} />
            <StatusBadge status={status} />
            {plan?.framework && (
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--input-bg)] border border-[var(--input-border)] text-[10px] text-[var(--text-secondary)]">
                <Cog className="w-3 h-3" />
                {plan.framework}
              </span>
            )}
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--input-bg)] border border-[var(--input-border)] text-[10px] text-[var(--text-secondary)] font-mono">
              <GitBranch className="w-3 h-3" />
              {branchLabel.slice(0, 24)}
              {branchLabel.length > 24 ? '...' : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isImported && !plan && (
              <button
                onClick={runBootstrap}
                disabled={bootstrapping}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 disabled:opacity-50 transition-all"
              >
                {bootstrapping ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Lightbulb className="w-3 h-3" />
                )}
                {bootstrapping ? 'Detecting...' : 'Detect framework'}
              </button>
            )}

            {(plan || (session.kind === 'generated' && hasFullstack)) && (
              <button
                onClick={buildSourceMap}
                disabled={buildingMap}
                title={
                  (session as any).route_index_summary
                    ? `Re-build source map (${
                        (session as any).route_index_summary.elements_indexed
                      } elements indexed)`
                    : 'Inject data-dv-id and install click bridge'
                }
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] disabled:opacity-50 transition-all"
              >
                {buildingMap ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (session as any).route_index_summary ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Link2 className="w-3 h-3" />
                )}
                {buildingMap ? 'Indexing...' : 'Source map'}
              </button>
            )}

            <PreviewControl
              status={status}
              launching={launching}
              stopping={stopping}
              hasPlan={canLaunchPreview}
              launchTitle={
                session.kind === 'imported' && !plan
                  ? 'Run framework detection first'
                  : session.kind === 'generated' && !hasFullstack
                    ? 'Run Magic build first (see steps above)'
                    : 'Launch preview'
              }
              onLaunch={launchPreview}
              onStop={stopPreview}
            />

            <div className="w-px h-5 bg-[var(--card-border)] mx-1" />

            <UndoRedoControls
              session={session}
              onChanged={loadSession}
            />

            <div className="w-px h-5 bg-[var(--card-border)] mx-1" />

            <button
              onClick={deploy}
              disabled={deploying}
              title="Deploy to Vercel"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-dv-accent/10 border border-dv-accent/20 text-dv-accent hover:bg-dv-accent/15 disabled:opacity-60 transition-all"
            >
              {deploying ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Rocket className="w-3 h-3" />
              )}
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>

            <button
              onClick={() => {
                const next = !showRuntimeDebug
                setShowRuntimeDebug(next)
                if (next) void loadRuntimeMetrics()
              }}
              className={clsx(
                'inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all',
                showRuntimeDebug
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
              )}
              title="Runtime metrics/debug panel"
            >
              Runtime debug
            </button>

            <button
              onClick={loadSession}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)]"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {showRuntimeDebug && (
          <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card-bg)]/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-semibold text-[var(--text-primary)]">Runtime Debug Metrics</p>
              <button
                onClick={() => void loadRuntimeMetrics()}
                disabled={runtimeMetricsLoading}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-[var(--input-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {runtimeMetricsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh
              </button>
            </div>
            {runtimeMetricsError ? (
              <p className="text-[11px] text-red-300">{runtimeMetricsError}</p>
            ) : !runtimeMetrics ? (
              <p className="text-[11px] text-[var(--text-secondary)]">
                {runtimeMetricsLoading ? 'Loading metrics...' : 'No metrics loaded yet.'}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <Metric label="Active runtimes" value={runtimeMetrics.active_runtime_rows} />
                  <Metric label="Active containers" value={runtimeMetrics.active_container_rows} />
                  <Metric label="Launch success" value={runtimeMetrics.launch_success} />
                  <Metric label="Launch failures" value={runtimeMetrics.launch_failures} />
                  <Metric label="Cleanup runs" value={runtimeMetrics.cleanup_runs} />
                  <Metric label="Cleanup removed" value={runtimeMetrics.cleanup_removed} />
                  <Metric label="Route prune runs" value={runtimeMetrics.route_prune_runs} />
                  <Metric label="Route prune removed" value={runtimeMetrics.route_prune_removed} />
                  <Metric label="Cleanup ms (last)" value={runtimeMetrics.cleanup_duration_ms_last} />
                  <Metric label="Launch attempts" value={runtimeMetrics.launch_attempts} />
                  <Metric label="Status calls" value={runtimeMetrics.status_calls} />
                  <Metric label="Stop calls" value={runtimeMetrics.stop_calls} />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Recent runtime events
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-auto pr-1">
                    {(runtimeMetrics.events || []).length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)]">No lifecycle events recorded yet.</p>
                    ) : (
                      [...(runtimeMetrics.events || [])]
                        .slice(-10)
                        .reverse()
                        .map((ev, idx) => (
                          <div
                            key={`${ev.ts}-${ev.event}-${idx}`}
                            className="text-[11px] rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 flex items-center gap-2 flex-wrap"
                          >
                            <span className="font-mono text-[var(--text-muted)]">{formatEventTs(ev.ts)}</span>
                            <span className="font-semibold text-[var(--text-primary)]">{ev.event}</span>
                            {ev.phase ? (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--hover-bg)] text-[var(--text-secondary)]">
                                {ev.phase}
                              </span>
                            ) : null}
                            {ev.runtime_key ? (
                              <span className="font-mono text-[var(--text-muted)]">
                                {String(ev.runtime_key).slice(0, 20)}
                              </span>
                            ) : null}
                            {ev.metadata && typeof ev.metadata === 'object' ? (
                              <span className="text-[var(--text-muted)]">
                                {Object.entries(ev.metadata)
                                  .slice(0, 2)
                                  .map(([k, v]) => `${k}:${String(v)}`)
                                  .join(' · ')}
                              </span>
                            ) : null}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mixedContentBlocked && rawPreviewUrl && status === 'running' && (
          <div className="px-4 py-2 border-b border-amber-500/25 bg-amber-500/10 text-[12px] text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-100 mb-0.5">Preview cannot load in the panel</p>
              <p className="text-[var(--text-secondary)] text-[11px] leading-snug">
                This Studio page is served over HTTPS, but the dev server uses HTTP on your
                machine. Browsers block that mix inside an iframe. Use{' '}
                <a
                  href={rawPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dv-accent font-semibold hover:underline"
                >
                  Open in new tab
                </a>{' '}
                — or run the Studio frontend at{' '}
                <span className="font-mono text-amber-100/90">http://localhost:3000</span> in dev.
              </p>
            </div>
          </div>
        )}

        {previewError && (
          <div className="px-4 py-2 border-b border-red-500/20 bg-red-500/10 text-[12px] text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1 break-words font-mono">{previewError}</div>
            <button
              onClick={() => setPreviewError(null)}
              className="text-[11px] text-red-200 hover:text-red-100 flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {session.kind === 'generated' && (
          <GeneratedAppStrip
            projectId={session.source_id}
            project={genProject}
            busy={genBusy}
            loadError={genProjectLoadError}
            onRetryLoad={() => {
              setGenProjectLoadError(null)
              void loadGenProject()
            }}
            onChanged={loadGenProject}
            onGenerating={(v) => setGenBusy(v)}
          />
        )}

        {/* 3-pane body — min-h-0 + overflow-hidden keeps row height fixed so chat scrolls internally */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <ChatPanel
            ref={chatPanelRef}
            sessionId={sessionId}
            anchorHint={previewPickForAi ? anchor : null}
            pendingChatAnchor={pendingChatAnchor}
            onPendingChatAnchorConsumed={() => setPendingChatAnchor(null)}
            previewActive={(status === 'running' || status === 'starting') && Boolean(previewSrc)}
            hasSourceMap={
              Number(
                (session as { route_index_summary?: { elements_indexed?: number } }).route_index_summary
                  ?.elements_indexed,
              ) > 0
            }
          />

          <PreviewCanvas
            ref={iframeRef}
            src={previewSrc}
            iframeMountKey={previewReloadNonce}
            loading={launching || status === 'starting'}
            status={status}
            onInspectModeChange={(inspect) => {
              setPreviewPickForAi(inspect)
              if (!inspect) setAnchor(null)
            }}
            onRefresh={() => {
              // Bump cache-buster so iframe `src` changes (same URL alone often does not reload).
              setPreviewReloadNonce((n) => n + 1)
            }}
            emptyMessage={
              mixedContentBlocked && rawPreviewUrl
                ? 'Embedded preview is unavailable from an HTTPS page when the dev server is plain HTTP. Use “Open in new tab” in the banner above, or run Studio on http://localhost:3000.'
                : isImported && !plan
                  ? 'Detect the framework first, then launch your app to see it live.'
                  : session.kind === 'generated' && !hasFullstack
                    ? 'For template & prompt projects: generate screen designs, run Magic build, then launch preview.'
                    : 'Launch your app to see live changes as you edit.'
            }
            emptyAction={
              mixedContentBlocked && rawPreviewUrl ? (
                <a
                  href={rawPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-dv-accent text-white px-3 py-2 rounded-lg hover:bg-dv-accent/90"
                >
                  Open preview in new tab
                </a>
              ) : isImported && !plan ? (
                <button
                  onClick={runBootstrap}
                  disabled={bootstrapping}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-500/90 disabled:opacity-50"
                >
                  {bootstrapping ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Lightbulb className="w-3 h-3" />
                  )}
                  Detect framework
                </button>
              ) : status === 'stopped' ? (
                <button
                  onClick={launchPreview}
                  disabled={launching || (session.kind === 'generated' && !hasFullstack)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-dv-accent text-white px-3 py-2 rounded-lg hover:bg-dv-accent/90 disabled:opacity-50"
                >
                  {launching ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Launch preview
                </button>
              ) : null
            }
          />

          <InspectorTabs
            session={session}
            builderProject={session.kind === 'generated' ? genProject : null}
            onThemeSaved={() => {
              void loadGenProject()
              setPreviewReloadNonce((n) => n + 1)
            }}
            onAnchorChange={setAnchor}
            currentAnchor={anchor}
            onUseComponentInChat={(block) => {
              setPendingChatAnchor({
                dvId: block.dv_id,
                tag: block.tag,
                componentLabel: block.label,
                sourceFile: block.source_file ?? null,
                sourceLine: block.source_line ?? null,
              })
              toast.success(`Next message targets “${block.label}”`)
              queueMicrotask(() => chatPanelRef.current?.focusInput())
            }}
          />
        </div>
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="text-[12px] font-semibold text-[var(--text-primary)] font-mono">{String(value)}</p>
    </div>
  )
}

function formatEventTs(ts: number): string {
  const ms = Number(ts) * 1000
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--'
  return new Date(ms).toLocaleTimeString([], { hour12: false })
}

// ───────────────────────────────────────────────────────────────────────────
// Generated app (template / prompt) — Stitch screens + Magic build before preview
// ───────────────────────────────────────────────────────────────────────────

function GeneratedAppStrip({
  projectId,
  project,
  busy,
  loadError,
  onRetryLoad,
  onChanged,
  onGenerating,
}: {
  projectId: string
  project: BuilderProject | null
  busy: 'screens' | 'magic' | null
  loadError: string | null
  onRetryLoad: () => void
  onChanged: () => void
  onGenerating: (phase: 'screens' | 'magic' | null) => void
}) {
  const screens = project?.screens ?? []
  const canGenScreens = screens.some(
    (s) => s.status === 'pending' || s.status === 'edited'
  )
  const withHtml = screens.filter((s) => {
    const html = (s as { generated_html?: string }).generated_html
    return typeof html === 'string' && html.trim().length > 0
  }).length
  const nMagic = project?.fullstack_files
    ? Object.keys(project.fullstack_files).length
    : 0
  const nScreens = screens.length
  const generating =
    project?.status === 'generating' ||
    screens.some((s) => s.status === 'generating') ||
    busy === 'screens'

  const statsLine =
    project && nScreens > 0
      ? `${withHtml}/${nScreens} screens with HTML · ${nMagic} full-stack files`
      : project
        ? 'No screens listed yet'
        : ''

  const runScreens = async () => {
    onGenerating('screens')
    try {
      await builder.generateScreens(projectId)
      toast.success('Screen designs generated')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Could not generate designs. Try again in a moment.')
    } finally {
      onGenerating(null)
    }
  }

  const runMagic = async () => {
    onGenerating('magic')
    try {
      await builder.magicBuild(projectId)
      toast.success('Magic build complete')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Magic build failed')
    } finally {
      onGenerating(null)
    }
  }

  return (
    <div className="px-4 py-3 border-b border-dv-accent/25 bg-dv-accent/[0.06] text-[12px] text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="w-4 h-4 text-dv-accent flex-shrink-0" />
        <span className="font-semibold text-[var(--text-primary)]">
          New app from template or prompt
        </span>
        <span className="text-[var(--text-faint)]">·</span>
        {!project && !loadError && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-dv-accent" />
            Loading App Studio project…
          </span>
        )}
        {loadError && !project && (
          <span className="inline-flex flex-wrap items-center gap-2 text-amber-200/90">
            {loadError}
            <button
              type="button"
              onClick={onRetryLoad}
              className="text-[11px] font-semibold text-dv-accent hover:underline"
            >
              Retry
            </button>
          </span>
        )}
        {project && (
          <span className="inline-flex flex-wrap items-center gap-2">
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin text-dv-accent" />}
            {statsLine}
            {withHtml === 0 && !generating && canGenScreens && (
              <span className="text-[var(--text-faint)]">
                — click <strong className="text-[var(--text-secondary)]">1. Generate designs</strong> to create
                screen visuals.
              </span>
            )}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runScreens()}
          disabled={!!busy || !project || !canGenScreens}
          title={
            !canGenScreens && project
              ? 'All screens already have designs'
              : 'Generate a visual design for each screen'
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] disabled:opacity-45 text-[11px] font-semibold"
        >
          {busy === 'screens' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 text-dv-accent" />
          )}
          1. Generate designs
        </button>
        <button
          type="button"
          onClick={() => void runMagic()}
          disabled={!!busy || !project || withHtml === 0}
          title={
            withHtml === 0
              ? 'Generate designs first'
              : 'Turn your screen designs into a working app'
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dv-accent/15 border border-dv-accent/30 text-dv-accent hover:bg-dv-accent/25 disabled:opacity-45 text-[11px] font-semibold"
        >
          {busy === 'magic' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Rocket className="w-3 h-3" />
          )}
          2. Magic build
        </button>
        <span className="text-[10px] text-[var(--text-faint)] self-center ml-1">
          When the build finishes, use <strong className="font-semibold text-[var(--text-secondary)]">Launch preview</strong> to try your app.
        </span>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Header sub-components
// ───────────────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={clsx(
        'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border',
        kind === 'generated'
          ? 'bg-dv-accent/10 text-dv-accent border-dv-accent/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      )}
    >
      {kind}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    starting: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    stopped: 'bg-[var(--input-bg)] text-[var(--text-muted)] border-[var(--input-border)]',
    draft: 'bg-[var(--input-bg)] text-[var(--text-muted)] border-[var(--input-border)]',
  }
  const cls = styles[status] || styles.stopped
  return (
    <span
      className={clsx(
        'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border',
        cls
      )}
    >
      {status}
    </span>
  )
}

function UndoRedoControls({
  session,
  onChanged,
}: {
  session: StudioSession
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<'undo' | 'redo' | null>(null)
  const checkpoints = (session.checkpoints || []) as Array<{
    id: string
    state?: string
  }>
  const canUndo = checkpoints.some((c) => c.state === 'applied')
  const canRedo = checkpoints.some((c) => c.state === 'undone')

  const doUndo = useCallback(async () => {
    if (!canUndo || busy) return
    setBusy('undo')
    try {
      const r = await studio.undo(session.id)
      toast.success(`Reverted ${r.checkpoint?.label || 'edit'}`)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Nothing to undo')
    } finally {
      setBusy(null)
    }
  }, [canUndo, busy, session.id, onChanged])

  const doRedo = useCallback(async () => {
    if (!canRedo || busy) return
    setBusy('redo')
    try {
      const r = await studio.redo(session.id)
      toast.success(`Re-applied ${r.checkpoint?.label || 'edit'}`)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'Nothing to redo')
    } finally {
      setBusy(null)
    }
  }, [canRedo, busy, session.id, onChanged])

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      const meta = e.ctrlKey || e.metaKey
      if (!meta) return
      if (e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        void doRedo()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void doUndo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        void doRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo, doRedo])

  return (
    <>
      <button
        onClick={doUndo}
        disabled={!canUndo || busy !== null}
        title="Undo last edit (Ctrl+Z)"
        className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy === 'undo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
      </button>
      <button
        onClick={doRedo}
        disabled={!canRedo || busy !== null}
        title="Redo (Ctrl+Shift+Z)"
        className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy === 'redo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Redo2 className="w-4 h-4" />}
      </button>
    </>
  )
}

function PreviewControl({
  status,
  launching,
  stopping,
  hasPlan,
  launchTitle,
  onLaunch,
  onStop,
}: {
  status: string
  launching: boolean
  stopping: boolean
  hasPlan: boolean
  launchTitle: string
  onLaunch: () => void
  onStop: () => void
}) {
  if (status === 'running' || status === 'starting') {
    return (
      <button
        onClick={onStop}
        disabled={stopping}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 disabled:opacity-50 transition-all"
      >
        {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-current" />}
        Stop
      </button>
    )
  }

  return (
    <button
      onClick={onLaunch}
      disabled={!hasPlan || launching}
      title={launchTitle}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-dv-accent text-white hover:bg-dv-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
    >
      {launching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
      {launching ? 'Launching...' : 'Launch'}
    </button>
  )
}
