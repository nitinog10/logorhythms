'use client'

import {
  useState,
  forwardRef,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
} from 'react'
import {
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  MousePointer2,
  ScanSearch,
} from 'lucide-react'
import { clsx } from 'clsx'

export type DeviceFrame = 'mobile' | 'tablet' | 'desktop' | 'fluid'

const FRAME_SIZES: Record<DeviceFrame, { w: number | null; h: number | null; label: string }> = {
  mobile: { w: 390, h: 844, label: 'iPhone 14 Pro' },
  tablet: { w: 820, h: 1180, label: 'iPad Air' },
  desktop: { w: 1440, h: 900, label: 'Desktop 1440' },
  fluid: { w: null, h: null, label: 'Fluid' },
}

/** Sync Studio iframe ↔ injected dv_bridge (inspect vs normal app usage). */
const STUDIO_BRIDGE_MSG = 'docuverse-studio-mode'

interface PreviewCanvasProps {
  src: string | null
  /** Changes when user reloads preview — remount iframe so the browser cannot reuse a stale document. */
  iframeMountKey?: number
  loading?: boolean
  onRefresh?: () => void
  onLaunch?: () => void
  /** Fires when toggling Pick for AI vs Use app (inspect vs interact). */
  onInspectModeChange?: (inspectMode: boolean) => void
  status?: string
  emptyMessage?: string
  emptyAction?: React.ReactNode
}

export const PreviewCanvas = forwardRef<HTMLIFrameElement, PreviewCanvasProps>(
  function PreviewCanvas(
    {
      src,
      iframeMountKey = 0,
      loading,
      onRefresh,
      onInspectModeChange,
      status,
      emptyMessage,
      emptyAction,
    },
    ref
  ) {
    const [frame, setFrame] = useState<DeviceFrame>('desktop')
    const [rotated, setRotated] = useState(false)
    /** false = clicks go to the app (interact); true = pick for AI / inspector */
    const [inspectMode, setInspectMode] = useState(true)
    const [scale, setScale] = useState(1)

    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement | null>(null)

    const setIframeRef = useCallback(
      (node: HTMLIFrameElement | null) => {
        iframeRef.current = node
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ;(ref as React.MutableRefObject<HTMLIFrameElement | null>).current = node
        }
      },
      [ref]
    )

    const cfg = FRAME_SIZES[frame]
    const w = cfg.w ? (rotated ? cfg.h! : cfg.w) : null
    const h = cfg.h ? (rotated ? cfg.w! : cfg.h) : null

    // Fit device frame inside the pane (no horizontal chase scroll on laptop/tablet presets).
    useLayoutEffect(() => {
      const el = scrollAreaRef.current
      if (!el || frame === 'fluid' || w == null || h == null) {
        setScale(1)
        return
      }
      const padding = 32
      const measure = () => {
        const cw = el.clientWidth - padding
        const ch = el.clientHeight - padding
        if (cw < 32 || ch < 32) return
        setScale(Math.min(1, cw / w, ch / h))
      }
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }, [w, h, frame, src])

    const pushInspectModeToPreview = useCallback(() => {
      const win = iframeRef.current?.contentWindow
      if (!win || !src) return
      const payload = {
        type: STUDIO_BRIDGE_MSG,
        mode: inspectMode ? 'inspect' : 'interact',
      } as const
      try {
        // Cross-port iframe (Studio :3000 vs preview :4000) and blocked/error docs use origin null;
        // concrete targetOrigin values always mismatch there.
        win.postMessage(payload, '*')
      } catch {
        /* detached or navigated-away iframe */
      }
    }, [src, inspectMode])

    useEffect(() => {
      pushInspectModeToPreview()
    }, [pushInspectModeToPreview])

    useEffect(() => {
      onInspectModeChange?.(inspectMode)
    }, [inspectMode, onInspectModeChange])

    // Bridge loads after first postMessage; re-sync inspect mode when it becomes ready (+ retries).
    useEffect(() => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.source !== iframeRef.current?.contentWindow) return
        const d = ev.data as { type?: string } | undefined
        if (!d || d.type !== 'dv-bridge-ready') return
        pushInspectModeToPreview()
      }
      window.addEventListener('message', onMsg)
      return () => window.removeEventListener('message', onMsg)
    }, [pushInspectModeToPreview, src])

    useEffect(() => {
      if (!src) return
      const delays = [0, 250, 800, 2000].map((ms) =>
        window.setTimeout(() => pushInspectModeToPreview(), ms)
      )
      return () => delays.forEach((id) => window.clearTimeout(id))
    }, [src, inspectMode, pushInspectModeToPreview])

    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="h-11 shrink-0 px-2 sm:px-3 flex flex-wrap items-center gap-2 justify-between border-b border-[var(--card-border)] bg-[var(--page-bg)]/40 backdrop-blur-md">
          <div className="flex items-center gap-1 flex-wrap">
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)]">
              <FrameToggle
                icon={<Smartphone className="w-3.5 h-3.5" />}
                active={frame === 'mobile'}
                label="Mobile"
                onClick={() => setFrame('mobile')}
              />
              <FrameToggle
                icon={<Tablet className="w-3.5 h-3.5" />}
                active={frame === 'tablet'}
                label="Tablet"
                onClick={() => setFrame('tablet')}
              />
              <FrameToggle
                icon={<Monitor className="w-3.5 h-3.5" />}
                active={frame === 'desktop'}
                label="Desktop"
                onClick={() => setFrame('desktop')}
              />
              <FrameToggle
                icon={<Maximize2 className="w-3.5 h-3.5" />}
                active={frame === 'fluid'}
                label="Fluid"
                onClick={() => setFrame('fluid')}
              />
            </div>

            {src && (
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)]"
                role="toolbar"
                aria-label="Preview interaction mode"
              >
                <ModeToggle
                  icon={<MousePointer2 className="w-3.5 h-3.5" />}
                  active={!inspectMode}
                  label="Use app — clicks go through to the preview (buttons, navigation)"
                  compactLabel="Use app"
                  onClick={() => setInspectMode(false)}
                />
                <ModeToggle
                  icon={<ScanSearch className="w-3.5 h-3.5" />}
                  active={inspectMode}
                  label="Pick for AI — selects a DOM node for edits (purple outline on hover)"
                  compactLabel="Pick for AI"
                  onClick={() => setInspectMode(true)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {frame !== 'fluid' && w != null && h != null && (
              <span className="hidden md:inline text-[11px] text-[var(--text-muted)] font-mono">
                {w}×{h}
                {scale < 1 && (
                  <span className="text-[var(--text-faint)] ml-1.5">{Math.round(scale * 100)}%</span>
                )}
              </span>
            )}
            {frame !== 'fluid' && (
              <button
                type="button"
                onClick={() => setRotated(!rotated)}
                className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] transition-all"
                title="Rotate device"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] transition-all"
                title="Reload preview"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {src && (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)]"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {status && (
              <span
                className={clsx(
                  'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                  status === 'running'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : status === 'starting'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                    : status === 'error'
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-[var(--input-bg)] text-[var(--text-muted)] border-[var(--input-border)]'
                )}
              >
                {status}
              </span>
            )}
          </div>
        </div>

        {/* Canvas surface — fills column; scrolling only when needed */}
        <div
          ref={scrollAreaRef}
          className="flex-1 min-h-0 min-w-0 overflow-auto bg-[var(--page-bg)]/40 overscroll-contain"
        >
          {!src ? (
            <div className="min-h-full flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mx-auto mb-4">
                  <Monitor className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
                  {loading ? 'Starting preview...' : 'No preview running'}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mb-4">
                  {emptyMessage ||
                    'Launch your app to see live changes as you edit.'}
                </p>
                {emptyAction}
              </div>
            </div>
          ) : frame === 'fluid' ? (
            <div className="w-full min-h-[min(100%,calc(100vh-12rem))] h-full p-2 box-border flex flex-col">
              <iframe
                key={`studio-preview-${iframeMountKey}`}
                ref={setIframeRef}
                src={src}
                onLoad={pushInspectModeToPreview}
                className="w-full flex-1 min-h-[400px] rounded-xl border border-[var(--card-border)] bg-white shadow-inner"
                sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
                title="Studio preview"
              />
            </div>
          ) : w != null && h != null ? (
            <div className="w-full min-h-full flex justify-center items-center p-4 box-border">
              <div
                className="rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.35)] border border-[var(--card-border)] bg-white shrink-0"
                style={{
                  width: w * scale,
                  height: h * scale,
                }}
              >
                <div
                  className="origin-top-left"
                  style={{
                    width: w,
                    height: h,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <iframe
                    key={`studio-preview-${iframeMountKey}`}
                    ref={setIframeRef}
                    src={src}
                    onLoad={pushInspectModeToPreview}
                    className="block w-full h-full border-0"
                    style={{ width: w, height: h }}
                    sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
                    title="Studio preview"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }
)

PreviewCanvas.displayName = 'PreviewCanvas'

function FrameToggle({
  icon,
  active,
  label,
  onClick,
}: {
  icon: React.ReactNode
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
        active
          ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      )}
    >
      {icon}
    </button>
  )
}

function ModeToggle({
  icon,
  active,
  label,
  compactLabel,
  onClick,
}: {
  icon: React.ReactNode
  active: boolean
  label: string
  compactLabel?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all',
        active
          ? 'bg-[var(--card-bg)] text-dv-accent shadow-sm ring-1 ring-dv-accent/25'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      )}
    >
      {icon}
      {compactLabel ? (
        <span className="hidden sm:inline max-w-[76px] truncate">{compactLabel}</span>
      ) : null}
    </button>
  )
}
