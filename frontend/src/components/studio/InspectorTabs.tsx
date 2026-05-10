'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  MousePointerClick,
  Folder,
  Palette,
  Boxes,
  GitBranch,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Code2,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
  MessageSquare,
  Trash2,
  Copy,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  files,
  studio,
  builder,
  type StudioSession,
  type FileNode as ApiFileNode,
  type StudioSavedComponent,
  type BuilderProject,
} from '@/lib/api'
import { createPatch } from 'diff'
import { html as diff2html } from 'diff2html'
import { ColorSchemeType } from 'diff2html/lib/types'
import 'diff2html/bundles/css/diff2html.min.css'
import toast from 'react-hot-toast'

type TabId = 'inspector' | 'files' | 'theme' | 'components' | 'git'

interface InspectorPanelProps {
  session: StudioSession
  onAnchorChange?: (anchor: { dvId?: string | null; tag?: string; classes?: string } | null) => void
  currentAnchor?: { dvId?: string | null; tag?: string; classes?: string } | null
  /** Wire saved component blocks to the chat one-shot anchor (Studio page). */
  onUseComponentInChat?: (block: StudioSavedComponent) => void
  /** Builder project (generated sessions) — avoids duplicate fetch when parent already loaded it. */
  builderProject?: BuilderProject | null
  /** After design system save (generated): refresh project + optionally bump preview. */
  onThemeSaved?: () => void
}

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'inspector', label: 'Inspector', icon: <MousePointerClick className="w-3.5 h-3.5" /> },
  { id: 'files', label: 'Files', icon: <Folder className="w-3.5 h-3.5" /> },
  { id: 'theme', label: 'Theme', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'components', label: 'Components', icon: <Boxes className="w-3.5 h-3.5" /> },
  { id: 'git', label: 'Git', icon: <GitBranch className="w-3.5 h-3.5" /> },
]

const INSPECTOR_COLLAPSED_KEY = 'dv_studio_inspector_collapsed'

export function InspectorTabs({
  session,
  onAnchorChange,
  currentAnchor,
  onUseComponentInChat,
  builderProject,
  onThemeSaved,
}: InspectorPanelProps) {
  const [tab, setTab] = useState<TabId>('inspector')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    function openInspectorTab(e: Event) {
      const d = (e as CustomEvent<{ tab?: TabId }>).detail
      const id = d?.tab
      if (
        id === 'inspector' ||
        id === 'files' ||
        id === 'theme' ||
        id === 'components' ||
        id === 'git'
      ) {
        setTab(id)
        setCollapsed(false)
      }
    }
    window.addEventListener('studio:open-inspector-tab', openInspectorTab)
    return () => window.removeEventListener('studio:open-inspector-tab', openInspectorTab)
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(INSPECTOR_COLLAPSED_KEY) === '1') {
        setCollapsed(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(INSPECTOR_COLLAPSED_KEY, collapsed ? '1' : '0')
      }
    } catch {
      /* ignore */
    }
  }, [collapsed])

  if (collapsed) {
    return (
      <aside
        className="w-11 flex-shrink-0 border-l border-[var(--card-border)] bg-[var(--card-bg)]/40 flex flex-col min-h-0"
        aria-label="Studio tools"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={clsx(
            'shrink-0 py-3 px-0 flex flex-col items-center justify-center',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
            'transition-colors border-b border-[var(--card-border)]'
          )}
          title="Expand Inspector panel"
          aria-expanded={false}
          aria-controls="studio-inspector-panel"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
          <span className="sr-only">Expand Inspector panel</span>
        </button>
        <nav
          className="flex flex-col items-stretch flex-1 min-h-0 py-1 gap-0.5"
          aria-label="Jump to Inspector tab"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setCollapsed(false)
              }}
              title={t.label}
              aria-current={tab === t.id ? 'true' : undefined}
              className={clsx(
                'mx-1 rounded-md py-2 flex items-center justify-center transition-colors',
                'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
                tab === t.id && 'text-dv-accent bg-dv-accent/10'
              )}
            >
              <span className="[&>svg]:w-3.5 [&>svg]:h-3.5" aria-hidden>
                {t.icon}
              </span>
              <span className="sr-only">{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    )
  }

  return (
    <aside
      id="studio-inspector-panel"
      className="w-[340px] flex-shrink-0 border-l border-[var(--card-border)] bg-[var(--card-bg)]/40 flex flex-col min-h-0"
    >
      <div className="flex flex-col shrink-0 border-b border-[var(--card-border)]">
        <div className="flex items-stretch min-h-[2.75rem]">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={clsx(
              'shrink-0 w-9 flex items-center justify-center',
              'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
              'border-b border-[var(--card-border)] border-r transition-colors'
            )}
            title="Hide Inspector — widen preview"
            aria-expanded={true}
            aria-controls="studio-inspector-panel"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Tabs wrap to multiple rows — no horizontal scroll */}
          <div
            role="tablist"
            aria-label="Inspector sections"
            className="flex flex-1 flex-wrap items-stretch gap-1 p-1 min-w-0"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex flex-1 basis-[calc(33.333%-0.25rem)] min-w-[5.25rem] min-h-[2.25rem]',
                  'items-center justify-center gap-1 px-2 py-1.5 rounded-md',
                  'text-[10px] font-medium leading-tight text-center transition-all',
                  tab === t.id
                    ? 'bg-dv-accent/15 text-[var(--text-primary)] ring-1 ring-inset ring-dv-accent/40'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                )}
              >
                <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{t.icon}</span>
                <span className="line-clamp-2 break-words hyphens-auto">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'inspector' && <InspectorBody session={session} onAnchorChange={onAnchorChange} />}
        {tab === 'files' && <FilesBody session={session} builderProject={builderProject} />}
        {tab === 'theme' && (
          <ThemeBody
            session={session}
            builderProject={builderProject}
            onThemeSaved={onThemeSaved}
          />
        )}
        {tab === 'components' && (
          <ComponentsBody
            session={session}
            currentAnchor={currentAnchor}
            onUseComponentInChat={onUseComponentInChat}
          />
        )}
        {tab === 'git' && <GitBody session={session} />}
      </div>
    </aside>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Inspector
// ───────────────────────────────────────────────────────────────────────────

function InspectorBody({
  session,
  onAnchorChange,
}: {
  session: StudioSession
  onAnchorChange?: (a: { dvId?: string | null; tag?: string; classes?: string } | null) => void
}) {
  const inspected = session.last_inspected_node?.event as Record<string, any> | undefined
  const dom = (inspected?.dom || inspected) as Record<string, any> | undefined

  useEffect(() => {
    if (!onAnchorChange) return
    if (!dom) {
      onAnchorChange(null)
      return
    }
    onAnchorChange({
      dvId: (inspected as any)?.dv_id ?? null,
      tag: dom.tag,
      classes: dom.className || dom.classes,
    })
  }, [inspected, dom, onAnchorChange])

  if (!dom) {
    return (
      <div className="p-4 text-center">
        <MousePointerClick className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">
          Click an element
        </p>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Click any element in the preview to inspect it. The AI chat will use it
          as the anchor for your next instruction.
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] p-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
          Element
        </div>
        <div className="font-mono text-[12px] text-[var(--text-primary)] break-all">
          &lt;{dom.tag}
          {dom.id && <span className="text-emerald-400"> id=&quot;{dom.id}&quot;</span>}
          {dom.className && (
            <span className="text-dv-accent"> class=&quot;{(dom.className || '').toString().slice(0, 50)}&quot;</span>
          )}
          &gt;
        </div>
      </div>

      {dom.computedStyle && (
        <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Computed Style
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            {Object.entries(dom.computedStyle).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">{k}</span>
                <span className="text-[var(--text-primary)] truncate ml-2 max-w-[60%]">
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(inspected as any)?.dv_id && (
        <div className="rounded-lg bg-dv-accent/5 border border-dv-accent/20 p-3">
          <div className="text-[10px] uppercase tracking-wider text-dv-accent mb-1">
            Source mapped (Phase 2)
          </div>
          <div className="font-mono text-[11px] text-[var(--text-primary)] break-all">
            {String((inspected as any).dv_id)}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Files
// ───────────────────────────────────────────────────────────────────────────

/** Build a virtual tree from flat Magic-build paths (e.g. src/app/page.tsx). */
function fullstackFilesToTree(paths: string[]): ApiFileNode[] {
  type Level = { dirs: Record<string, Level>; files: Set<string> }
  const root: Level = { dirs: {}, files: new Set() }
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (i === parts.length - 1) {
        cur.files.add(seg)
      } else {
        if (!cur.dirs[seg]) cur.dirs[seg] = { dirs: {}, files: new Set() }
        cur = cur.dirs[seg]
      }
    }
  }
  const toNodes = (level: Level, prefix: string): ApiFileNode[] => {
    const out: ApiFileNode[] = []
    for (const name of Object.keys(level.dirs).sort()) {
      const path = prefix ? `${prefix}/${name}` : name
      out.push({
        id: path,
        path,
        name,
        is_directory: true,
        language: null,
        size: null,
        children: toNodes(level.dirs[name], path),
      })
    }
    for (const name of [...level.files].sort()) {
      const path = prefix ? `${prefix}/${name}` : name
      out.push({
        id: path,
        path,
        name,
        is_directory: false,
        language: null,
        size: null,
        children: [],
      })
    }
    return out
  }
  return toNodes(root, '')
}

function FilesBody({
  session,
  builderProject,
}: {
  session: StudioSession
  builderProject?: BuilderProject | null
}) {
  const [tree, setTree] = useState<ApiFileNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedGenPath, setSelectedGenPath] = useState<string | null>(null)

  const isImported = session.kind === 'imported'
  const isGenerated = session.kind === 'generated'
  const sourceId = session.source_id
  const fullstack = builderProject?.fullstack_files
  const genPathList = useMemo(
    () => (fullstack ? Object.keys(fullstack).sort() : []),
    [fullstack]
  )
  const genTree = useMemo(() => fullstackFilesToTree(genPathList), [genPathList])

  const load = async () => {
    if (!isImported) return
    setLoading(true)
    setError(null)
    try {
      const t = await files.getTree(sourceId)
      setTree(Array.isArray(t) ? t : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load file tree')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  // Expand folders so the Magic output tree is visible without extra clicks.
  useEffect(() => {
    if (!isGenerated || genPathList.length === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const p of genPathList) {
        const parts = p.split('/').filter(Boolean)
        let acc = ''
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i]
          next.add(acc)
        }
      }
      return next
    })
  }, [isGenerated, genPathList])

  if (isGenerated) {
    if (genPathList.length === 0) {
      return (
        <div className="p-4 text-center">
          <Folder className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">
            Generated app
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Run <strong className="text-[var(--text-secondary)]">2. Magic build</strong> above to emit
            source files. Then browse them here and use chat to edit.
          </p>
        </div>
      )
    }

    const content = selectedGenPath && fullstack?.[selectedGenPath]

    return (
      <div className="p-2 flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            Magic build output
          </span>
          <span className="text-[10px] text-[var(--text-faint)]">{genPathList.length} files</span>
        </div>
        <div className="text-[12px] font-mono max-h-[min(280px,40vh)] overflow-y-auto shrink-0 border-b border-[var(--card-border)] pb-2">
          {genTree.map((n) => (
            <FileNode
              key={n.path}
              node={n}
              expanded={expanded}
              setExpanded={setExpanded}
              depth={0}
              selectedPath={selectedGenPath}
              onSelectFile={setSelectedGenPath}
            />
          ))}
        </div>
        {selectedGenPath && (
          <div className="mt-2 flex-1 min-h-0 flex flex-col px-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1 truncate">
              {selectedGenPath}
            </div>
            <pre className="text-[10px] leading-relaxed text-[var(--text-primary)] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md p-2 overflow-auto max-h-[min(360px,50vh)] whitespace-pre-wrap break-words font-mono">
              {content ?? '—'}
            </pre>
          </div>
        )}
        {!selectedGenPath && (
          <p className="text-[10px] text-[var(--text-muted)] px-2 pt-2">
            Click a file to view its contents (read-only).
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          {session.title}
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="px-2 py-1.5 text-[11px] text-red-300">{error}</div>
      )}

      {loading && !tree ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : tree && tree.length > 0 ? (
        <div className="text-[12px] font-mono">
          {tree.map((n) => (
            <FileNode
              key={n.path}
              node={n}
              expanded={expanded}
              setExpanded={setExpanded}
              depth={0}
            />
          ))}
        </div>
      ) : (
        <div className="px-2 py-4 text-[11px] text-[var(--text-muted)] text-center">
          No files indexed yet.
        </div>
      )}
    </div>
  )
}

function FileNode({
  node,
  expanded,
  setExpanded,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: ApiFileNode
  expanded: Set<string>
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>
  depth: number
  /** When set, file rows highlight when `node.path` matches. */
  selectedPath?: string | null
  /** When set, clicking a file invokes this (imported sessions omit this). */
  onSelectFile?: (path: string) => void
}) {
  const isOpen = expanded.has(node.path)
  const isDir = node.is_directory
  const isSelected = selectedPath != null && selectedPath === node.path

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(node.path)) next.delete(node.path)
              else next.add(node.path)
              return next
            })
          } else {
            onSelectFile?.(node.path)
          }
        }}
        className={clsx(
          'w-full flex items-center gap-1 px-1.5 py-1 hover:bg-[var(--hover-bg)] rounded text-left',
          isSelected && 'bg-dv-accent/10 ring-1 ring-inset ring-dv-accent/25'
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isDir ? (
          isOpen ? (
            <ChevronDown className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
          )
        ) : (
          <span className="w-3 inline-block flex-shrink-0" />
        )}
        {isDir ? (
          <Folder className="w-3 h-3 text-amber-400 flex-shrink-0" />
        ) : (
          <FileText className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
        )}
        <span className="text-[var(--text-primary)] truncate">{node.name}</span>
      </button>
      {isDir && isOpen && node.children && (
        <>
          {node.children.map((c) => (
            <FileNode
              key={c.path}
              node={c}
              expanded={expanded}
              setExpanded={setExpanded}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </>
      )}
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Theme — Stitch-style design system (builder `design_system` + updateDesignSystem)
// ───────────────────────────────────────────────────────────────────────────

function ThemeBody({
  session,
  builderProject: builderProjectProp,
  onThemeSaved,
}: {
  session: StudioSession
  builderProject?: BuilderProject | null
  onThemeSaved?: () => void
}) {
  const isGenerated = session.kind === 'generated'
  const [loadedProject, setLoadedProject] = useState<BuilderProject | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [cornerRoundness, setCornerRoundness] = useState('medium')
  const [appearance, setAppearance] = useState('light')
  const [styleNotes, setStyleNotes] = useState('')

  const effectiveProject = builderProjectProp ?? loadedProject

  useEffect(() => {
    if (!isGenerated) return
    if (builderProjectProp) return
    let cancelled = false
    setLoadError(null)
    ;(async () => {
      try {
        const p = await builder.getProject(session.source_id)
        if (!cancelled) setLoadedProject(p)
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load project')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isGenerated, session.source_id, builderProjectProp])

  useEffect(() => {
    const p = effectiveProject
    if (!p) return
    const d = p.design_system
    if (!d) return
    setPrimaryColor(d.primaryColor || '#6366f1')
    setFontFamily(d.fontFamily || 'Inter')
    setCornerRoundness(d.cornerRoundness || 'medium')
    setAppearance((d.appearance || 'light').toLowerCase())
    setStyleNotes(d.styleNotes || '')
  }, [effectiveProject?.id, effectiveProject?.updated_at])

  const colorPickerHex = useMemo(() => {
    const s = primaryColor.trim()
    if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s
    if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
      const r = s[1],
        g = s[2],
        b = s[3]
      return `#${r}${r}${g}${g}${b}${b}`
    }
    return '#6366f1'
  }, [primaryColor])

  const saveDesignSystem = async () => {
    if (!isGenerated || !effectiveProject) return
    const hex = primaryColor.trim()
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex)) {
      toast.error('Primary color must be a hex value like #6366f1 or #rgb')
      return
    }
    setSaving(true)
    try {
      await builder.updateDesignSystem(session.source_id, {
        primary_color: hex.slice(0, 30),
        font_family: fontFamily.trim() || undefined,
        corner_roundness: cornerRoundness.trim().slice(0, 20) || undefined,
        appearance: appearance === 'dark' ? 'dark' : 'light',
        style_notes: styleNotes.trim().slice(0, 500) || undefined,
      })
      toast.success('Design system saved')
      onThemeSaved?.()
    } catch (e: any) {
      toast.error(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!isGenerated) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
          <p className="text-[12px] font-medium text-[var(--text-primary)] mb-1">Repo-based theming</p>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-3">
            This imported project does not use the App Studio design-system JSON. Theme it by editing
            Tailwind or global CSS in your tree—e.g. <span className="font-mono text-[10px]">tailwind.config</span>,{' '}
            <span className="font-mono text-[10px]">globals.css</span>, or CSS modules.
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-3">
            In chat, use{' '}
            <span className="font-mono text-dv-accent">/theme dark emerald rounded-xl</span> for AI-assisted token or
            class changes.
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('studio:open-inspector-tab', { detail: { tab: 'files' } })
              )
            }
            className="w-full py-2 rounded-lg bg-dv-accent/15 border border-dv-accent/25 text-dv-accent text-[12px] font-semibold hover:bg-dv-accent/20"
          >
            Open Files tab
          </button>
        </div>
      </div>
    )
  }

  if (loadError && !builderProjectProp) {
    return (
      <div className="p-4 text-[12px] text-red-300">
        {loadError}
      </div>
    )
  }

  if (!effectiveProject) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  const fontPresets = ['Inter', 'Geist Sans', 'DM Sans', 'system-ui']

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold px-0.5">
        Design system
      </p>
      <p className="text-[10px] text-[var(--text-secondary)] leading-snug px-0.5">
        Same tokens as App Studio / Stitch flows. Saving updates the builder project; new Magic builds and
        generations pick these up. For a quick tweak in the live app, use{' '}
        <span className="font-mono text-dv-accent">/theme</span> in chat or reload preview after a full rebuild.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            Primary color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorPickerHex}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-[var(--input-border)] bg-transparent"
              aria-label="Primary color"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              maxLength={30}
              className="flex-1 min-w-0 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            Font family
          </label>
          <input
            type="text"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            maxLength={80}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {fontPresets.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFontFamily(f)}
                className={clsx(
                  'text-[10px] px-2 py-0.5 rounded border',
                  fontFamily === f
                    ? 'border-dv-accent/50 bg-dv-accent/15 text-dv-accent'
                    : 'border-[var(--card-border)] text-[var(--text-muted)] hover:border-dv-accent/30'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            Corner roundness
          </label>
          <select
            value={['small', 'medium', 'large'].includes(cornerRoundness.toLowerCase()) ? cornerRoundness.toLowerCase() : 'medium'}
            onChange={(e) => setCornerRoundness(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            Appearance
          </label>
          <select
            value={appearance.includes('dark') ? 'dark' : 'light'}
            onChange={(e) => setAppearance(e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text-primary)]"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1">
            Style notes
          </label>
          <textarea
            value={styleNotes}
            onChange={(e) => setStyleNotes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. soft shadows, generous spacing, indigo accents…"
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] resize-none"
          />
          <p className="text-[9px] text-[var(--text-faint)] mt-0.5">{styleNotes.length}/500</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void saveDesignSystem()}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-dv-accent text-white text-[12px] font-semibold hover:bg-dv-accent/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save design system'}
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Components
// ───────────────────────────────────────────────────────────────────────────

function ComponentsBody({
  session,
  currentAnchor,
  onUseComponentInChat,
}: {
  session: StudioSession
  currentAnchor?: { dvId?: string | null; tag?: string; classes?: string } | null
  onUseComponentInChat?: (block: StudioSavedComponent) => void
}) {
  const [items, setItems] = useState<StudioSavedComponent[]>([])
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await studio.listComponents(session.id)
      setItems(r.components || [])
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [session.id])

  const saveSelection = async () => {
    if (!label.trim()) {
      toast.error('Enter a label for this block')
      return
    }
    setSaving(true)
    try {
      await studio.saveComponent(session.id, {
        label: label.trim(),
        description: description.trim() || undefined,
        dv_id: currentAnchor?.dvId ?? null,
        html: null,
        tag: currentAnchor?.tag ?? null,
      })
      setLabel('')
      setDescription('')
      toast.success('Saved to library')
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this saved block from the session library?')) return
    setDeletingId(id)
    try {
      await studio.deleteComponent(session.id, id)
      toast.success('Removed')
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const copyPath = (path: string) => {
    if (!path) return
    void navigator.clipboard.writeText(path).then(
      () => toast.success('Path copied'),
      () => toast.error('Could not copy')
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Save from selection
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          In the preview, use Pick for AI and click an element, then name it below.
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Hero CTA button"
          maxLength={80}
          className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-dv-accent/40"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional note (what to change here, design intent…)"
          maxLength={400}
          rows={2}
          className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md px-2 py-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-dv-accent/40 resize-none"
        />
        <button
          type="button"
          onClick={saveSelection}
          disabled={saving || !currentAnchor?.tag}
          className="w-full py-2 rounded-lg bg-dv-accent/15 border border-dv-accent/25 text-dv-accent text-[12px] font-semibold hover:bg-dv-accent/20 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save current element'}
        </button>
        {!currentAnchor?.tag && (
          <p className="text-[10px] text-amber-400/90">
            Select an element in the preview first.
          </p>
        )}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold px-1">
        Saved blocks ({items.length})
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)] px-1">No saved blocks yet.</p>
      ) : (
        <ul className="space-y-2 max-h-[min(320px,50vh)] overflow-y-auto">
          {items.map((c) => {
            const loc =
              c.source_file != null
                ? `${c.source_file}${c.source_line != null ? `:${c.source_line}` : ''}`
                : null
            return (
              <li
                key={c.id}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-2 text-[11px] space-y-1.5"
              >
                <div className="font-medium text-[var(--text-primary)]">{c.label}</div>
                {c.description ? (
                  <p className="text-[10px] text-[var(--text-secondary)] leading-snug">{c.description}</p>
                ) : null}
                <div className="text-[var(--text-muted)] font-mono truncate text-[10px]">
                  {loc ?? (
                    <>
                      {c.tag || '—'}
                      {c.dv_id ? ` · ${c.dv_id.slice(0, 28)}…` : ''}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {onUseComponentInChat && (c.dv_id || c.tag) ? (
                    <button
                      type="button"
                      onClick={() => onUseComponentInChat(c)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/25 text-[10px] font-semibold hover:bg-violet-500/25"
                      title="Target this block in the next chat message"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Use in chat
                    </button>
                  ) : null}
                  {c.source_file ? (
                    <button
                      type="button"
                      onClick={() => copyPath(c.source_file!)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--input-bg)] border border-[var(--input-border)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <Copy className="w-3 h-3" />
                      Copy path
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={deletingId === c.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {deletingId === c.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Git
// ───────────────────────────────────────────────────────────────────────────

function GitBody({ session }: { session: StudioSession }) {
  const [diff, setDiff] = useState<{
    files: Array<{
      path: string
      before: string | null
      after: string | null
      label: string
      ts: string
    }>
  } | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [creatingPr, setCreatingPr] = useState(false)
  const [prTitle, setPrTitle] = useState('')

  const loadDiff = async () => {
    setDiffLoading(true)
    try {
      const r = await studio.gitDiff(session.id)
      setDiff(r)
      if (!activeFile && r.files.length > 0) setActiveFile(r.files[0].path)
    } catch {
      /* noop */
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    void loadDiff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.edit_history?.length])

  const activeFileEntry = diff?.files.find((f) => f.path === activeFile) || null
  const diffHtml = activeFileEntry
    ? renderDiff(activeFileEntry.path, activeFileEntry.before, activeFileEntry.after)
    : ''

  const submitPr = async () => {
    if (!prTitle.trim()) {
      toast.error('Title is required')
      return
    }
    setCreatingPr(true)
    try {
      const r = await studio.commitAndPr(session.id, {
        title: prTitle.trim(),
        open_pr: true,
      })
      if (r.error) {
        toast.error(r.error)
      } else if (r.pr?.url) {
        toast.success('Pull request opened')
        window.open(r.pr.url, '_blank')
      } else if (r.repo_url) {
        toast.success('Repository created')
        window.open(r.repo_url, '_blank')
      } else if (r.files_pushed.length === 0) {
        toast('No changes to push', { icon: 'ℹ️' })
      } else {
        toast.success(`Pushed ${r.files_pushed.length} files`)
      }
      setPrTitle('')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to push')
    } finally {
      setCreatingPr(false)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] p-3">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Branch
          </span>
        </div>
        <div className="font-mono text-[11px] text-[var(--text-primary)] break-all mb-1">
          {session.branch_head}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          based on{' '}
          <span className="font-mono text-[var(--text-secondary)]">
            {session.branch_base}
          </span>
        </div>
      </div>

      <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--input-border)]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            Changed files
          </span>
          <button
            onClick={loadDiff}
            disabled={diffLoading}
            className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--text-muted)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${diffLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="max-h-32 overflow-y-auto">
          {diffLoading && !diff ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : diff && diff.files.length > 0 ? (
            diff.files.map((f) => (
              <button
                key={f.path}
                onClick={() => setActiveFile(f.path)}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-mono truncate ${
                  activeFile === f.path
                    ? 'bg-dv-accent/10 text-dv-accent'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                {f.path}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
              No changes yet. Make an edit through chat.
            </p>
          )}
        </div>
      </div>

      {diffHtml && (
        <div className="rounded-lg overflow-hidden border border-[var(--input-border)] dv-diff-shell">
          <style>{`
            .dv-diff-shell .d2h-wrapper { background: var(--card-bg, #f8fafc) !important; color: var(--text-primary, #0f172a); }
            .dv-diff-shell .d2h-file-header {
              background: var(--input-bg, #f1f5f9) !important;
              border-color: var(--card-border, #e2e8f0) !important;
              color: var(--text-primary, #0f172a) !important;
            }
            .dv-diff-shell .d2h-code-line,
            .dv-diff-shell .d2h-code-side-line,
            .dv-diff-shell .d2h-code-line-ctn,
            .dv-diff-shell .d2h-info,
            .dv-diff-shell .d2h-cntx {
              font-size: 10.5px !important;
              line-height: 1.45 !important;
              background: var(--card-bg, #ffffff) !important;
              border-color: var(--card-border, #e2e8f0) !important;
              color: var(--text-primary, #1e293b) !important;
            }
            .dv-diff-shell .d2h-code-line-prefix,
            .dv-diff-shell .d2h-code-line-suffix { color: var(--text-muted, #64748b) !important; }
            .dv-diff-shell .d2h-ins { background: rgb(220 252 231 / 0.85) !important; }
            .dv-diff-shell .d2h-del { background: rgb(254 226 226 / 0.85) !important; }
            .dv-diff-shell .d2h-file-name { font-size: 11px !important; color: var(--text-primary, #0f172a) !important; }
          `}</style>
          <div
            dangerouslySetInnerHTML={{ __html: diffHtml }}
            className="max-h-[420px] overflow-auto"
          />
        </div>
      )}

      <div className="rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Open pull request
        </div>
        <input
          value={prTitle}
          onChange={(e) => setPrTitle(e.target.value)}
          placeholder="Studio: tweak hero gradient"
          maxLength={120}
          className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md px-2 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-dv-accent/40"
        />
        <button
          onClick={submitPr}
          disabled={creatingPr || !diff?.files.length}
          title={!diff?.files.length ? 'No changes to push yet' : 'Open PR'}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-dv-accent text-white text-[12px] font-semibold hover:bg-dv-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {creatingPr ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Code2 className="w-3.5 h-3.5" />
          )}
          {creatingPr ? 'Pushing...' : 'Push & open PR'}
        </button>
      </div>
    </div>
  )
}

function renderDiff(path: string, before: string | null, after: string | null): string {
  if (before == null && after == null) return ''
  const oldText = before ?? ''
  const newText = after ?? ''
  if (oldText === newText) return ''
  const patch = createPatch(path, oldText, newText, '', '', { context: 3 })
  return diff2html(patch, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: 'line-by-line',
    colorScheme: ColorSchemeType.LIGHT,
  })
}
