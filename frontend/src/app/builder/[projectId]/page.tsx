'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Sparkles, Loader2, Send, Palette, Layout, Plus,
  Monitor, Smartphone, Tablet, Wand2, Copy, Save,
  Check, Eye, Code2, Zap, FileCode, ChevronDown,
  Play, Square, Settings, X,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { builder, BuilderProject } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const ease = [0.23, 1, 0.32, 1] as const

export default function BuilderWorkspacePage() {
  const params = useParams()
  const projectId = params.projectId as string
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [project, setProject] = useState<BuilderProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [showDesign, setShowDesign] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [codeContent, setCodeContent] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [clickedElement, setClickedElement] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [isMagicBuilding, setIsMagicBuilding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [codeView, setCodeView] = useState<'html' | 'fullstack'>('html')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'design' | 'fullstack'>('design')
  const [fsPreviewUrl, setFsPreviewUrl] = useState<string | null>(null)
  const [isLaunchingPreview, setIsLaunchingPreview] = useState(false)
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [envVars, setEnvVars] = useState<Array<{ name: string; description: string; value: string; has_default: boolean }>>([])
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [lastEditType, setLastEditType] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Load project
  const loadProject = useCallback(async () => {
    try {
      const data = await builder.getProject(projectId)
      setProject(data)
      if (!selectedScreen && data.screens.length > 0) {
        setSelectedScreen(data.screens[0].id)
      }
    } catch (err) {
      console.error('Failed to load project:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, selectedScreen])

  useEffect(() => { loadProject() }, [loadProject])

  // Listen for postMessage from iframe (click-to-edit + navigation)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // A5 fix: only accept messages from same origin (the builder uses blob
      // URLs / data URLs loaded from our own origin, not an external server).
      if (e.origin !== window.location.origin && e.origin !== 'null') return
      if (!e.data || typeof e.data !== 'object') return

      if (e.data.type === 'element-click') {
        setClickedElement(e.data)
        if (e.data.screenId) setSelectedScreen(e.data.screenId)
        const tag = e.data.tag || 'element'
        setEditPrompt(`Change the ${tag} to `)
      }

      if (e.data.type === 'screen-navigate' && e.data.screenId) {
        setSelectedScreen(e.data.screenId)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Fetch code when Code tab is active
  useEffect(() => {
    if (activeTab !== 'code' || !selectedScreen || !project) return
    setCodeLoading(true)
    builder.getScreenCode(projectId, selectedScreen)
      .then(res => setCodeContent(res.code))
      .catch(() => setCodeContent('// Failed to load code'))
      .finally(() => setCodeLoading(false))
  }, [activeTab, selectedScreen, projectId, project])

  // Reset code content when screen changes
  useEffect(() => {
    setCodeContent(null)
  }, [selectedScreen])

  const handleGenerate = async () => {
    if (!project) return
    setIsGenerating(true)
    try {
      const updated = await builder.generateScreens(projectId)
      setProject(updated)
      setPreviewKey(k => k + 1)
    } catch (err) {
      console.error('Generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEditScreen = async () => {
    if (!editPrompt.trim() || !selectedScreen || !project) return
    setIsEditing(true)
    setLastEditType(null)
    try {
      // Use quick-edit API with auto-classification
      const result = await builder.quickEdit(projectId, selectedScreen, editPrompt)
      setProject(result.project)
      setLastEditType(result.edit_type)
      setEditPrompt('')
      setClickedElement(null)
      setPreviewKey(k => k + 1)
      setCodeContent(null)
      // Clear edit type badge after 3s
      setTimeout(() => setLastEditType(null), 3000)
    } catch (err) {
      console.error('Edit failed:', err)
      // Fallback to original edit endpoint
      try {
        const updated = await builder.editScreen(projectId, selectedScreen, editPrompt)
        setProject(updated)
        setEditPrompt('')
        setClickedElement(null)
        setPreviewKey(k => k + 1)
        setCodeContent(null)
      } catch (err2) {
        console.error('Fallback edit also failed:', err2)
      }
    } finally {
      setIsEditing(false)
    }
  }

  const handleAddScreen = async () => {
    if (!project) return
    try {
      const screen = await builder.addScreen(projectId, { name: `Screen ${(project.screens?.length || 0) + 1}` })
      await loadProject()
      setSelectedScreen(screen.id)
    } catch (err) {
      console.error('Failed to add screen:', err)
    }
  }

  const handleCopyCode = () => {
    if (!codeContent) return
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMagicBuild = async () => {
    if (!project) return
    setIsMagicBuilding(true)
    try {
      const updated = await builder.magicBuild(projectId)
      setProject(updated)
      setCodeView('fullstack')
      setActiveTab('code')
      if (updated.fullstack_files) {
        const files = Object.keys(updated.fullstack_files)
        setSelectedFile(files[0] || null)
      }
    } catch (err) {
      console.error('Magic Build failed:', err)
    } finally {
      setIsMagicBuilding(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await builder.saveProject(projectId)
      setSavedAt(result.saved_at)
      setTimeout(() => setSavedAt(null), 3000)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleLaunchPreview = async () => {
    setIsLaunchingPreview(true)
    try {
      const result = await builder.launchPreview(projectId)
      if (result.url) {
        setFsPreviewUrl(result.url)
        setPreviewMode('fullstack')
      }
    } catch (err) {
      console.error('Launch preview failed:', err)
    } finally {
      setIsLaunchingPreview(false)
    }
  }

  const handleDetectEnv = async () => {
    try {
      const result = await builder.detectEnv(projectId)
      setEnvVars(result.env_vars)
      const vals: Record<string, string> = {}
      result.env_vars.forEach(v => { vals[v.name] = v.value || '' })
      setEnvValues(vals)
      setShowEnvModal(true)
    } catch (err) {
      console.error('Detect env failed:', err)
    }
  }

  const handleSaveEnv = async () => {
    try {
      await builder.saveEnv(projectId, envValues)
      setShowEnvModal(false)
    } catch (err) {
      console.error('Save env failed:', err)
    }
  }

  const currentScreen = project?.screens.find(s => s.id === selectedScreen)
  const deviceWidth = device === 'mobile' ? 'max-w-[375px]' : device === 'tablet' ? 'max-w-[768px]' : 'max-w-full'
  const hasGeneratedScreens = project?.screens.some(s => s.status === 'ready')
  const hasMagicBuild = project?.magic_build_status === 'ready' && project?.fullstack_files
  const fullstackFiles = project?.fullstack_files ? Object.keys(project.fullstack_files).sort() : []
  // Per-screen preview — serves Stitch HTML directly, no SPA wrapper
  const previewUrl = selectedScreen
    ? `${API_URL}/api/builder/projects/${projectId}/screens/${selectedScreen}/preview?t=${previewKey}`
    : ''
  const activePreviewUrl = previewMode === 'fullstack' && fsPreviewUrl ? fsPreviewUrl : previewUrl

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-6 h-6 text-dv-accent animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-[var(--text-muted)]">Loading workspace...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[15px] text-[var(--text-secondary)] mb-4">Project not found</p>
          <Link href="/builder" className="text-[13px] text-dv-accent hover:underline">← Back to App Studio</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[var(--page-bg)] flex flex-col text-[var(--text-primary)] overflow-hidden">
      {/* ── Top bar ── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/builder" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-[1px] h-5 bg-[var(--card-border)]" />
          <Sparkles className="w-3.5 h-3.5 text-dv-accent" />
          <span className="text-[14px] font-semibold">{project.title}</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${
            project.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            project.status === 'generating' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' :
            project.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
            'bg-blue-500/10 text-blue-400 border-blue-500/20'
          }`}>
            {project.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Device toggle */}
          <div className="flex items-center bg-[var(--input-bg)] rounded-lg border border-[var(--input-border)] p-0.5">
            {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
              <button key={d} onClick={() => setDevice(d)} className={`p-1.5 rounded-md transition-all ${device === d ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <button onClick={() => setShowDesign(!showDesign)} className={`p-2 rounded-lg transition-all ${showDesign ? 'bg-dv-accent/10 text-dv-accent' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'}`}>
            <Palette className="w-4 h-4" />
          </button>

          {/* Save button */}
          <button onClick={handleSave} disabled={isSaving} className={`p-2 rounded-lg transition-all relative ${isSaving ? 'text-dv-accent' : savedAt ? 'text-emerald-400' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'}`} title="Save project">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAt ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          </button>

          {/* Magic Build button */}
          <button
            onClick={handleMagicBuild}
            disabled={isMagicBuilding || !hasGeneratedScreens}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
            title="Convert to full-stack app with backend, database, and APIs"
          >
            {isMagicBuilding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {isMagicBuilding ? 'Building...' : hasMagicBuild ? '⚡ Rebuild' : '⚡ Magic Build'}
          </button>

          {/* Launch Preview button (visible after Magic Build) */}
          {hasMagicBuild && (
            <>
              <button
                onClick={handleLaunchPreview}
                disabled={isLaunchingPreview}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-500 hover:to-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                title="Launch real full-stack preview with backend + database"
              >
                {isLaunchingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : fsPreviewUrl ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isLaunchingPreview ? 'Launching...' : fsPreviewUrl ? 'Running' : '▶ Launch Preview'}
              </button>
              <button onClick={handleDetectEnv} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all" title="Configure environment variables">
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}

          <button onClick={handleGenerate} disabled={isGenerating} className="flex items-center gap-2 text-[12px] font-semibold bg-white text-black px-4 py-1.5 rounded-lg hover:bg-white/90 active:scale-[0.97] transition-all disabled:opacity-50">
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            {isGenerating ? 'Generating...' : hasGeneratedScreens ? 'Regenerate' : 'Generate All'}
          </button>

          {/* Edit type indicator */}
          {lastEditType && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide animate-pulse ${
              lastEditType === 'css' ? 'bg-emerald-500/20 text-emerald-400' :
              lastEditType === 'quick' ? 'bg-amber-500/20 text-amber-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {lastEditType === 'css' ? '⚡ Instant' : lastEditType === 'quick' ? '🚀 Quick' : '🏗 Structural'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Screen Navigator (Left Sidebar) ── */}
        <div className="w-[220px] border-r border-[var(--card-border)] bg-[var(--card-bg)]/50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-[var(--card-border)]">
            <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Screens</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {project.screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => setSelectedScreen(screen.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 flex items-center gap-2.5 group ${
                  selectedScreen === screen.id
                    ? 'bg-dv-accent/10 text-dv-accent'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <Layout className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate flex-1">{screen.name}</span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  screen.status === 'ready' ? 'bg-emerald-400' :
                  screen.status === 'edited' ? 'bg-blue-400' :
                  screen.status === 'generating' ? 'bg-amber-400 animate-pulse' :
                  screen.status === 'error' ? 'bg-red-400' :
                  'bg-[var(--text-faint)]'
                }`} />
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-[var(--card-border)]">
            <button onClick={handleAddScreen} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all">
              <Plus className="w-3 h-3" />
              Add Screen
            </button>
          </div>
        </div>

        {/* ── Main Preview Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="h-10 flex items-center gap-1 px-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]/30 flex-shrink-0">
            {(['preview', 'code'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${activeTab === tab ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                {tab === 'preview' ? <Eye className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}

            {/* Copy button for code tab */}
            {activeTab === 'code' && codeContent && (
              <button onClick={handleCopyCode} className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}

            {/* Clicked element indicator */}
            {clickedElement && (
              <div className="ml-auto flex items-center gap-2 px-2.5 py-1 rounded-lg bg-dv-accent/10 text-dv-accent text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-dv-accent animate-pulse" />
                Editing: &lt;{clickedElement.tag}&gt;
                <button onClick={() => { setClickedElement(null); setEditPrompt('') }} className="hover:text-white ml-1">✕</button>
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'preview' ? (
              <div className="h-full flex items-start justify-center p-4 bg-[var(--page-bg)] overflow-auto">
                <div className={`${deviceWidth} w-full h-full transition-all duration-300`}>
                  {/* Generating overlay */}
                  {isGenerating && (
                    <div className="absolute inset-0 z-10 bg-[var(--page-bg)]/90 backdrop-blur-sm flex items-center justify-center">
                      <div className="text-center">
                        <div className="relative w-16 h-16 mx-auto mb-4">
                          <div className="absolute inset-0 rounded-full border-2 border-dv-accent/20" />
                          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-dv-accent animate-spin" />
                          <Wand2 className="absolute inset-0 m-auto w-6 h-6 text-dv-accent" />
                        </div>
                        <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Generating your app...</p>
                        <p className="text-[12px] text-[var(--text-muted)]">This may take 30-60 seconds per screen</p>
                      </div>
                    </div>
                  )}

                  {hasGeneratedScreens && selectedScreen ? (
                    /* Live interactive preview iframe */
                    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.2)] h-full flex flex-col">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--card-border)] bg-[var(--card-bg)] flex-shrink-0">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                        </div>
                        <div className="flex-1 mx-4">
                          <div className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-1 text-[11px] text-[var(--text-muted)] text-center truncate">
                            {previewMode === 'fullstack' && fsPreviewUrl
                              ? `${fsPreviewUrl} — Full-Stack Preview`
                              : `${currentScreen?.name || project.title} — Design Preview`}
                          </div>
                        </div>
                        {/* Preview mode toggle */}
                        {hasMagicBuild && fsPreviewUrl && (
                          <div className="flex items-center bg-[var(--input-bg)] rounded-md border border-[var(--input-border)] p-0.5">
                            <button onClick={() => setPreviewMode('design')} className={`text-[9px] font-medium px-2 py-0.5 rounded transition-all ${previewMode === 'design' ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                              Design
                            </button>
                            <button onClick={() => setPreviewMode('fullstack')} className={`text-[9px] font-medium px-2 py-0.5 rounded transition-all ${previewMode === 'fullstack' ? 'bg-emerald-500/20 text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                              Full-Stack
                            </button>
                          </div>
                        )}
                        <div className={`text-[10px] font-medium flex items-center gap-1 ${previewMode === 'fullstack' && fsPreviewUrl ? 'text-emerald-400' : 'text-blue-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${previewMode === 'fullstack' && fsPreviewUrl ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                          {previewMode === 'fullstack' && fsPreviewUrl ? 'App Running' : 'Live'}
                        </div>
                      </div>
                      <iframe
                        ref={iframeRef}
                        key={`${previewKey}-${previewMode}`}
                        src={activePreviewUrl}
                        title="App Preview"
                        className="flex-1 w-full border-0 bg-white"
                        sandbox="allow-scripts allow-popups allow-forms"
                      />
                    </div>
                  ) : (
                    /* Empty state — no app generated yet */
                    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.2)]">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                        </div>
                        <div className="flex-1 text-center text-[11px] text-[var(--text-muted)]">{project.title}</div>
                      </div>
                      <div className="p-8">
                        <div className="text-center py-16">
                          <div className="w-16 h-16 rounded-2xl bg-dv-accent/10 border border-dv-accent/15 flex items-center justify-center mx-auto mb-6">
                            <Layout className="w-7 h-7 text-dv-accent" />
                          </div>
                          <h3 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
                            {project.screens.length} screens ready to generate
                          </h3>
                          <p className="text-[13px] text-[var(--text-muted)] mb-6 max-w-md mx-auto">
                            Click &quot;Generate All&quot; to build a fully interactive application with navigation, working buttons, forms, and real-time interactions.
                          </p>
                          <button onClick={handleGenerate} disabled={isGenerating} className="inline-flex items-center gap-2 text-[13px] font-semibold bg-white text-black px-6 py-2.5 rounded-xl hover:bg-white/90 active:scale-[0.97] transition-all disabled:opacity-50">
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {isGenerating ? 'Generating...' : 'Generate All Screens'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Code tab */
              <div className="h-full flex flex-col bg-[#0d0d12]">
                {/* Code view toggle */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1e1e2e] flex-shrink-0">
                  <button
                    onClick={() => setCodeView('html')}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${codeView === 'html' ? 'bg-white/10 text-white' : 'text-[#71717a] hover:text-white'}`}
                  >
                    <Eye className="w-3 h-3 inline mr-1.5" />HTML
                  </button>
                  <button
                    onClick={() => { setCodeView('fullstack'); if (!selectedFile && fullstackFiles.length) setSelectedFile(fullstackFiles[0]) }}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${codeView === 'fullstack' ? 'bg-indigo-500/20 text-indigo-300' : 'text-[#71717a] hover:text-white'} ${!hasMagicBuild ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!hasMagicBuild}
                    title={hasMagicBuild ? 'View full-stack code' : 'Run Magic Build first'}
                  >
                    <FileCode className="w-3 h-3 inline mr-1.5" />Full-Stack
                    {hasMagicBuild && <span className="ml-1.5 text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded">{fullstackFiles.length} files</span>}
                  </button>

                  <div className="flex-1" />

                  <button onClick={handleCopyCode} className="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1 transition-colors">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {codeView === 'html' ? (
                  /* Stitch HTML code */
                  codeLoading ? (
                    <div className="flex items-center justify-center flex-1">
                      <Loader2 className="w-5 h-5 text-dv-accent animate-spin" />
                    </div>
                  ) : codeContent ? (
                    <pre className="flex-1 overflow-auto p-6 text-[12px] font-mono text-[#e4e4e7] leading-relaxed whitespace-pre-wrap break-words">
                      <code>{codeContent}</code>
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center flex-1 text-[var(--text-muted)] text-[13px]">
                      {currentScreen ? 'Generate screens first to view code' : 'Select a screen to view code'}
                    </div>
                  )
                ) : (
                  /* Full-Stack code browser */
                  <div className="flex-1 flex overflow-hidden">
                    {/* File tree sidebar */}
                    <div className="w-[200px] border-r border-[#1e1e2e] overflow-y-auto flex-shrink-0">
                      <div className="p-2 space-y-0.5">
                        {fullstackFiles.map(file => {
                          const depth = file.split('/').length - 1
                          const fileName = file.split('/').pop() || file
                          const isDir = file.endsWith('/')
                          const isSelected = selectedFile === file
                          return (
                            <button
                              key={file}
                              onClick={() => { setSelectedFile(file); setCodeContent(project?.fullstack_files?.[file] || '') }}
                              className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono truncate transition-all flex items-center gap-1 ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'text-[#8b8b9e] hover:text-white hover:bg-white/5'}`}
                              style={{ paddingLeft: `${8 + depth * 12}px` }}
                            >
                              <FileCode className="w-3 h-3 flex-shrink-0 opacity-50" />
                              {fileName}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {/* File content */}
                    <div className="flex-1 overflow-auto">
                      {selectedFile && project?.fullstack_files?.[selectedFile] ? (
                        <pre className="p-6 text-[12px] font-mono text-[#e4e4e7] leading-relaxed whitespace-pre-wrap break-words">
                          <code>{project.fullstack_files[selectedFile]}</code>
                        </pre>
                      ) : (
                        <div className="flex items-center justify-center h-full text-[#71717a] text-[13px]">
                          Select a file to view code
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── AI Prompt Bar (bottom) ── */}
          <div className="border-t border-[var(--card-border)] bg-[var(--card-bg)]/80 backdrop-blur-xl p-3 flex-shrink-0">
            <div className="flex items-center gap-2 max-w-[800px] mx-auto">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={clickedElement
                    ? `Describe how to change the ${clickedElement.tag}...`
                    : currentScreen
                    ? `Edit "${currentScreen.name}" — describe your changes...`
                    : 'Select a screen to edit...'}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditScreen()}
                  disabled={!selectedScreen || isEditing}
                  className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 pr-10 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-dv-accent/30 focus:border-dv-accent/25 transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleEditScreen}
                  disabled={!editPrompt.trim() || !selectedScreen || isEditing}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-dv-accent hover:bg-dv-accent/10 transition-all disabled:opacity-30"
                >
                  {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Design System Panel (Right Sidebar) ── */}
        <AnimatePresence>
          {showDesign && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              className="border-l border-[var(--card-border)] bg-[var(--card-bg)]/50 overflow-hidden flex-shrink-0"
            >
              <div className="w-[280px] p-4">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-dv-accent" />
                  Design System
                </h3>

                <div className="space-y-5">
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Primary Color</label>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg border border-[var(--input-border)]" style={{ backgroundColor: project.design_system?.primaryColor || '#6366f1' }} />
                      <input type="text" value={project.design_system?.primaryColor || '#6366f1'} readOnly className="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-secondary)] font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Font Family</label>
                    <div className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                      {project.design_system?.fontFamily || 'Inter'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Appearance</label>
                    <div className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text-secondary)] capitalize">
                      {project.design_system?.appearance || 'Light'}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--card-border)]">
                  <h4 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Requirements</h4>
                  <div className="space-y-2">
                    {(project.requirements?.features || []).slice(0, 6).map((f: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                        <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    {/* ── Environment Variable Config Modal ── */}
    {showEnvModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
            <div>
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Environment Configuration</h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Set required environment variables for your app</p>
            </div>
            <button onClick={() => setShowEnvModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {envVars.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)] text-center py-8">No environment variables detected</p>
            ) : (
              envVars.map(v => (
                <div key={v.name} className="space-y-1">
                  <label className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-semibold text-[var(--text-primary)]">{v.name}</span>
                    {v.has_default && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">Has default</span>}
                  </label>
                  {v.description && <p className="text-[11px] text-[var(--text-muted)]">{v.description}</p>}
                  <input
                    type={v.name.toLowerCase().includes('secret') || v.name.toLowerCase().includes('password') ? 'password' : 'text'}
                    value={envValues[v.name] || ''}
                    onChange={e => setEnvValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                    placeholder={v.has_default ? 'Using default value' : `Enter ${v.name}`}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:outline-none focus:ring-1 focus:ring-dv-accent/30 focus:border-dv-accent/25 transition-all"
                  />
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-end gap-2">
            <button onClick={() => setShowEnvModal(false)} className="text-[12px] px-4 py-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-all">
              Cancel
            </button>
            <button onClick={handleSaveEnv} className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-dv-accent text-white hover:bg-dv-accent/90 transition-all">
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}
