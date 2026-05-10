'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Boxes,
  Sparkles,
  FolderGit2,
  Loader2,
  ArrowRight,
  Wand2,
  Layers,
  Users,
  BarChart3,
  ShoppingBag,
  Kanban,
  Rocket,
  Plus,
  Trash2,
  Github,
  ChevronRight,
  Lightbulb,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import {
  studio,
  builder,
  repositories,
  AppTemplate,
  StudioSessionSummary,
} from '@/lib/api'
import GradientMesh from '@/components/landing/GradientMesh'
import RevealText from '@/components/landing/RevealText'
import TiltCard from '@/components/landing/TiltCard'

const ease = [0.23, 1, 0.32, 1] as const

const iconMap: Record<string, React.ReactNode> = {
  users: <Users className="w-6 h-6" />,
  'bar-chart-3': <BarChart3 className="w-6 h-6" />,
  'shopping-bag': <ShoppingBag className="w-6 h-6" />,
  kanban: <Kanban className="w-6 h-6" />,
  rocket: <Rocket className="w-6 h-6" />,
}

interface RepoLite {
  id: string
  name: string
  full_name?: string
  language?: string | null
}

const PROMPT_EXAMPLES = [
  'A project management tool for remote teams with kanban boards and time tracking',
  'A subscription marketplace for indie SaaS tools with reviews and Stripe billing',
  'A booking platform for fitness instructors with calendar sync and payments',
]

const ONBOARDING_KEY = 'dv_studio_onboarding_v1'

export default function StudioIndexPage() {
  const router = useRouter()

  const [sessions, setSessions] = useState<StudioSessionSummary[]>([])
  const [templates, setTemplates] = useState<AppTemplate[]>([])
  const [repos, setRepos] = useState<RepoLite[]>([])
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState('free')
  const [used, setUsed] = useState(0)
  const [limit, setLimit] = useState(1)

  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [onboardStep, setOnboardStep] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_KEY)) {
      setShowOnboarding(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [s, t, r, p] = await Promise.all([
        studio.listSessions().catch(() => ({ sessions: [], total: 0 })),
        builder.getTemplates().catch(() => [] as AppTemplate[]),
        repositories.list().catch(() => [] as any),
        builder.listProjects().catch(() => ({
          projects: [],
          limit: 1,
          used: 0,
          tier: 'free',
        })),
      ])
      setSessions(s.sessions || [])
      setTemplates(t || [])
      const rArr = Array.isArray(r) ? r : (r as any)?.repositories || []
      setRepos(
        (rArr || []).map((x: any) => ({
          id: x.id,
          name: x.name,
          full_name: x.full_name,
          language: x.language,
        }))
      )
      setTier((p as any)?.tier || 'free')
      setUsed((p as any)?.used || 0)
      setLimit((p as any)?.limit || 1)
    } catch (e: any) {
      setError(e?.message || 'Failed to load Studio data')
    } finally {
      setLoading(false)
    }
  }

  async function startFromTemplate(templateId: string) {
    if (used >= limit) return
    setBusy(`tpl:${templateId}`)
    setError(null)
    try {
      const r = await studio.createFromTemplate({ template_id: templateId })
      router.push(`/studio/${r.session.id}`)
    } catch (e: any) {
      setError(e?.message || 'Failed to start project')
      setBusy(null)
    }
  }

  async function startFromPrompt() {
    if (!prompt.trim() || used >= limit) return
    setBusy('prompt')
    setError(null)
    try {
      const r = await studio.createFromPrompt({ prompt: prompt.trim() })
      router.push(`/studio/${r.session.id}`)
    } catch (e: any) {
      setError(e?.message || 'Failed to start project')
      setBusy(null)
    }
  }

  async function openFromRepo(repoId: string) {
    setBusy(`repo:${repoId}`)
    setError(null)
    try {
      const list = await studio
        .listSessions()
        .catch(() => ({ sessions: [], total: 0 }))
      const existing = list.sessions.find(
        (s) => s.kind === 'imported' && (s as any).source_id === repoId
      )
      if (existing) {
        router.push(`/studio/${existing.id}`)
        return
      }
      const created = await studio.createSession({
        kind: 'imported',
        source_id: repoId,
      })
      router.push(`/studio/${created.id}`)
    } catch (e: any) {
      setError(e?.message || 'Failed to open repository in Studio')
      setBusy(null)
    }
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this Studio session? Project files are not affected.'))
      return
    try {
      await studio.deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete session')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-dv-accent/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        <GradientMesh className="fixed opacity-30" />

        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1280px] mx-auto">
            <div className="flex items-center gap-3">
              <Boxes className="w-4 h-4 text-dv-accent" />
              <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
                Studio
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-dv-accent/15 text-dv-accent border border-dv-accent/20">
                BETA
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <span>
                {used} / {limit} projects
              </span>
              <span className="w-1 h-1 rounded-full bg-[var(--text-faint)]" />
              <span className="capitalize">{tier} plan</span>
            </div>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-12 max-w-[1280px] mx-auto">
          {/* Hero */}
          <div className="mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-dv-accent/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-dv-accent/50" />
                One workspace for everything
              </span>
            </motion.div>

            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
              delay={0.15}
            >
              What are you building today?
            </RevealText>

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.6 }}
            >
              Start from a template, describe your idea, or import an existing
              GitHub repo. Studio runs your app live, lets you click any element
              to edit it, and ships a real PR or live deploy.
            </motion.p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-[12px] text-red-300"
            >
              {error}
            </motion.div>
          )}

          {/* Prompt box */}
          <motion.div
            className="mb-6 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease }}
          >
            <div className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-1 flex items-center gap-2 shadow-[0_2px_20px_rgba(0,0,0,0.15)]">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-dv-accent/10 flex items-center justify-center ml-2">
                <Wand2 className="w-4 h-4 text-dv-accent" />
              </div>
              <input
                type="text"
                placeholder='Describe an app... "A subscription marketplace for indie SaaS tools"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startFromPrompt()}
                disabled={busy === 'prompt' || used >= limit}
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] py-3 px-2 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={startFromPrompt}
                disabled={!prompt.trim() || busy === 'prompt' || used >= limit}
                className="flex items-center gap-2 text-[13px] font-semibold bg-white text-black px-6 py-2.5 rounded-xl hover:bg-white/90 active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed mr-1"
              >
                {busy === 'prompt' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Generate
              </button>
            </div>

            {/* Suggested prompts */}
            <div className="flex flex-wrap gap-2 mt-3">
              <Lightbulb className="w-3.5 h-3.5 text-[var(--text-muted)] mt-1" />
              {PROMPT_EXAMPLES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-dv-accent/30 transition-all"
                >
                  {p.length > 50 ? p.slice(0, 50) + '...' : p}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Or import from GitHub */}
          <motion.div
            className="mb-14 flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <span className="text-[12px] text-[var(--text-muted)]">
              or work on existing code
            </span>
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md border border-[var(--card-border)] hover:border-dv-accent/30 transition-colors"
            >
              <Github className="w-3 h-3" />
              Import from GitHub
            </Link>
          </motion.div>

          {/* Continue working */}
          {!loading && sessions.length > 0 && (
            <section className="mb-14">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium">
                  <span className="w-6 h-[1px] bg-white/10" />
                  Continue working
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {sessions.length} active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sessions.slice(0, 6).map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.4 }}
                    className="group relative rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-dv-accent/30 transition-colors"
                  >
                    <Link href={`/studio/${s.id}`} className="block p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                          {s.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            s.kind === 'generated'
                              ? 'bg-dv-accent/10 text-dv-accent border-dv-accent/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {s.kind}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                        <span>{s.framework || 'detecting...'}</span>
                        <span>{s.edit_count} edits</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-dv-accent mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        Open
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete session"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Templates */}
          <section className="mb-14">
            <div className="mb-5">
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium">
                <span className="w-6 h-[1px] bg-white/10" />
                Start from a template
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-dv-accent animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {templates.map((template, i) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.06, duration: 0.5 }}
                  >
                    <TiltCard className="rounded-2xl">
                      <div className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 group transition-all duration-300 hover:border-white/[0.12] overflow-hidden">
                        <div
                          className="absolute top-0 right-0 w-[200px] h-[200px] rounded-full blur-[80px] opacity-[0.06] pointer-events-none transition-opacity group-hover:opacity-[0.12]"
                          style={{ backgroundColor: template.preview_color }}
                        />

                        <div className="relative">
                          <div className="flex items-center gap-3 mb-4">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300"
                              style={{
                                backgroundColor: `${template.preview_color}15`,
                                color: template.preview_color,
                                border: `1px solid ${template.preview_color}25`,
                              }}
                            >
                              {iconMap[template.icon] || (
                                <Layers className="w-5 h-5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                                {template.name}
                              </h3>
                              <span className="text-[11px] text-[var(--text-muted)] capitalize">
                                {template.category} • {template.screen_count}{' '}
                                screens
                              </span>
                            </div>
                          </div>

                          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-2 min-h-[2.6em]">
                            {template.description}
                          </p>

                          <button
                            onClick={() => startFromTemplate(template.id)}
                            disabled={
                              busy === `tpl:${template.id}` || used >= limit
                            }
                            className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold py-2 rounded-xl border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] hover:border-white/[0.15] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {busy === `tpl:${template.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Use this template
                            <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                          </button>
                        </div>
                      </div>
                    </TiltCard>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Imported repos */}
          {repos.length > 0 && (
            <section className="mb-14">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium">
                  <span className="w-6 h-[1px] bg-white/10" />
                  Your connected repositories
                </span>
                <Link
                  href="/settings/integrations"
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                >
                  Manage
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {repos.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openFromRepo(r.id)}
                    disabled={busy === `repo:${r.id}`}
                    className="group text-left rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 hover:border-emerald-500/40 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                        {r.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mb-3 truncate">
                      {r.full_name || r.language || 'Connected repository'}
                    </p>
                    <span className="inline-flex items-center text-[11px] text-emerald-400">
                      {busy === `repo:${r.id}` ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          Opening...
                        </>
                      ) : (
                        <>
                          Open in Studio <ArrowRight className="w-3 h-3 ml-1" />
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Limit warning */}
          {used >= limit && (
            <motion.div
              className="mt-8 rounded-2xl bg-dv-accent/5 border border-dv-accent/15 p-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-[14px] text-[var(--text-secondary)] mb-3">
                You&apos;ve reached the {tier} plan limit of {limit} project
                {limit === 1 ? '' : 's'}.
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-dv-accent hover:text-dv-accent/80 transition-colors"
              >
                Upgrade your plan
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          )}
        </div>
      </main>

      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl p-6">
            <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-2">
              {onboardStep === 0 && 'Click to edit'}
              {onboardStep === 1 && 'Describe a change'}
              {onboardStep === 2 && 'Ship it'}
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-6">
              {onboardStep === 0 &&
                'Open any project, launch the preview, then click an element. The AI uses your selection as context for the next edit.'}
              {onboardStep === 1 &&
                'Use the AI Assistant on the left. Try slash commands like /edit, /theme, or /deploy. Changes can apply to real source when the source map is built.'}
              {onboardStep === 2 &&
                'Use Deploy for a live URL, or the Git tab to push changes and open a pull request on GitHub.'}
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(ONBOARDING_KEY, '1')
                  setShowOnboarding(false)
                }}
                className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Skip tour
              </button>
              <div className="flex gap-2">
                {onboardStep > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnboardStep((s) => Math.max(0, s - 1))}
                    className="px-3 py-2 rounded-lg text-[12px] border border-[var(--card-border)] text-[var(--text-secondary)]"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (onboardStep < 2) setOnboardStep((s) => s + 1)
                    else {
                      localStorage.setItem(ONBOARDING_KEY, '1')
                      setShowOnboarding(false)
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-dv-accent text-white hover:bg-dv-accent/90"
                >
                  {onboardStep < 2 ? 'Next' : 'Done'}
                </button>
              </div>
            </div>
            <div className="flex justify-center gap-1.5 mt-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === onboardStep ? 'w-6 bg-dv-accent' : 'w-1.5 bg-[var(--text-faint)]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
