'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Users,
  BarChart3,
  ShoppingBag,
  Kanban,
  Rocket,
  Plus,
  ArrowRight,
  Loader2,
  Layers,
  Wand2,
  FolderOpen,
  Trash2,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { builder, AppTemplate } from '@/lib/api'
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

export default function BuilderPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<AppTemplate[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [tier, setTier] = useState('free')
  const [used, setUsed] = useState(0)
  const [limit, setLimit] = useState(1)
  const [mounted, setMounted] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    setMounted(true)
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [tmpl, proj] = await Promise.all([
        builder.getTemplates().catch(() => []),
        builder.listProjects().catch(() => ({ projects: [], limit: 1, used: 0, tier: 'free' })),
      ])
      setTemplates(tmpl)
      setProjects(proj.projects || [])
      setTier(proj.tier || 'free')
      setUsed(proj.used || 0)
      setLimit(proj.limit || 1)
    } catch (err) {
      console.error('Failed to load builder data:', err)
    } finally {
      setIsLoading(false)
      setProjectsLoading(false)
    }
  }

  const handleCreateFromTemplate = async (templateId: string) => {
    if (used >= limit) return
    setIsCreating(true)
    try {
      const project = await builder.createFromTemplate({ template_id: templateId })
      router.push(`/builder/${project.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
      setIsCreating(false)
    }
  }

  const handleCreateFromPrompt = async () => {
    if (!customPrompt.trim() || used >= limit) return
    setIsCreating(true)
    try {
      const project = await builder.createFromRequirements(customPrompt)
      router.push(`/builder/${project.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
      setIsCreating(false)
    }
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this project?')) return
    try {
      await builder.deleteProject(projectId)
      loadData()
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-dv-bg flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-dv-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-dv-accent/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        <GradientMesh className="fixed opacity-30" />

        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-[var(--page-bg)]/70 backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-dv-accent" />
              <h1 className="text-[15px] font-semibold tracking-[-0.01em]">App Studio</h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-dv-accent/15 text-dv-accent border border-dv-accent/20">
                BETA
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <span>{used} / {limit} projects</span>
              <span className="w-1 h-1 rounded-full bg-[var(--text-faint)]" />
              <span className="capitalize">{tier} plan</span>
            </div>
          </div>
        </div>

        <div className="relative z-[1] px-8 py-12 max-w-[1200px] mx-auto">
          {/* Hero */}
          <div className="mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-dv-accent/70 mb-5 font-medium">
                <span className="w-8 h-[1px] bg-dv-accent/50" />
                The Canva for Software
              </span>
            </motion.div>

            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-4"
              delay={0.15}
            >
              Build your SaaS in minutes
            </RevealText>

            <motion.p
              className="text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.7 }}
            >
              Choose a template or describe your idea. AI generates the full UI, you click-to-edit
              anything, then push directly to your GitHub.
            </motion.p>
          </div>

          {/* Custom prompt input */}
          <motion.div
            className="mb-14 relative"
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
                placeholder='Describe your app... "A project management tool for remote teams with Kanban boards"'
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFromPrompt()}
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] py-3 px-2 focus:outline-none"
                disabled={isCreating || used >= limit}
              />
              <button
                onClick={handleCreateFromPrompt}
                disabled={!customPrompt.trim() || isCreating || used >= limit}
                className="flex items-center gap-2 text-[13px] font-semibold bg-white text-black px-6 py-2.5 rounded-xl hover:bg-white/90 active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed mr-1"
              >
                {isCreating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Generate
              </button>
            </div>
          </motion.div>

          {/* Existing Projects */}
          {projects.length > 0 && (
            <div className="mb-14">
              <motion.span
                className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium mb-5 block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <span className="w-6 h-[1px] bg-white/10" />
                Your Projects
              </motion.span>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease }}
                  >
                    <TiltCard className="rounded-2xl">
                      <Link
                        href={`/builder/${project.id}`}
                        className="block relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 group transition-all duration-300 hover:border-white/[0.12]"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-dv-accent/10 border border-dv-accent/15 flex items-center justify-center">
                            <FolderOpen className="w-4 h-4 text-dv-accent" />
                          </div>
                          <button
                            onClick={(e) => handleDeleteProject(e, project.id)}
                            className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1 truncate">
                          {project.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span className="capitalize">{project.status}</span>
                          <span className="w-1 h-1 rounded-full bg-[var(--text-faint)]" />
                          <span>{project.screen_count} screens</span>
                        </div>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    </TiltCard>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Templates */}
          <motion.span
            className="inline-flex items-center gap-2 text-[12px] tracking-[0.18em] uppercase text-[var(--text-muted)] font-medium mb-5 block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="w-6 h-[1px] bg-white/10" />
            Start from a Template
          </motion.span>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-dv-accent animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {templates.map((template, i) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease }}
                >
                  <TiltCard className="rounded-2xl">
                    <div className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 group transition-all duration-300 hover:border-white/[0.12] overflow-hidden">
                      {/* Colored glow */}
                      <div
                        className="absolute top-0 right-0 w-[200px] h-[200px] rounded-full blur-[80px] opacity-[0.06] pointer-events-none transition-opacity group-hover:opacity-[0.12]"
                        style={{ backgroundColor: template.preview_color }}
                      />

                      <div className="relative">
                        {/* Icon + Category */}
                        <div className="flex items-center gap-3 mb-5">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300"
                            style={{
                              backgroundColor: `${template.preview_color}15`,
                              color: template.preview_color,
                              border: `1px solid ${template.preview_color}25`,
                            }}
                          >
                            {iconMap[template.icon] || <Layers className="w-6 h-6" />}
                          </div>
                          <div>
                            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                              {template.name}
                            </h3>
                            <span className="text-[11px] text-[var(--text-muted)] capitalize">
                              {template.category} • {template.screen_count} screens
                            </span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-5 line-clamp-2">
                          {template.description}
                        </p>

                        {/* Features */}
                        <div className="flex flex-wrap gap-1.5 mb-6">
                          {template.features.slice(0, 4).map((feature) => (
                            <span
                              key={feature}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--input-border)]"
                            >
                              {feature}
                            </span>
                          ))}
                          {template.features.length > 4 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium text-[var(--text-faint)]">
                              +{template.features.length - 4} more
                            </span>
                          )}
                        </div>

                        {/* CTA */}
                        <button
                          onClick={() => handleCreateFromTemplate(template.id)}
                          disabled={isCreating || used >= limit}
                          className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-2.5 rounded-xl border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] hover:border-white/[0.15] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isCreating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Use Template
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </button>
                      </div>
                    </div>
                  </TiltCard>
                </motion.div>
              ))}
            </div>
          )}

          {/* Limit warning */}
          {used >= limit && (
            <motion.div
              className="mt-8 rounded-2xl bg-dv-accent/5 border border-dv-accent/15 p-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-[14px] text-[var(--text-secondary)] mb-3">
                You&apos;ve reached the {tier} plan limit of {limit} project{limit === 1 ? '' : 's'}.
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
    </div>
  )
}
