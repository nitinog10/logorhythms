'use client'

import { useState, useEffect } from 'react'
import { Upload, Loader2, CheckCircle2, ExternalLink, AlertCircle, X, FileText, Sparkles } from 'lucide-react'
import { github, documentation, RepositoryDocumentation } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

interface PushDocsButtonProps {
  repoId: string
  fullName: string          // "owner/repo"
  docs: RepositoryDocumentation | null
}

export function PushDocsButton({ repoId, fullName, docs }: PushDocsButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [projectDescription, setProjectDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [generatedReadme, setGeneratedReadme] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Track which step we're on
  const [step, setStep] = useState<'describe' | 'preview' | 'done'>('describe')

  // Load persisted state on mount
  useEffect(() => {
    const [owner, repo] = fullName.split('/')
    if (owner && repo) {
      github.getAutomationStatus(owner, repo).then((s) => {
        if (s.docs_url) {
          setResultUrl(s.docs_url)
        }
      }).catch(() => {})
    }
  }, [fullName])

  const handleOpenModal = () => {
    if (!docs) {
      toast.error('Generate documentation first')
      return
    }
    setShowModal(true)
    setStep('describe')
    setGeneratedReadme(null)
    setError(null)
  }

  const handleGenerateReadme = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const result = await documentation.generateReadme(repoId, projectDescription)
      setGeneratedReadme(result.readme)
      setStep('preview')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate README'
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePushToGithub = async () => {
    if (!generatedReadme) return

    const [owner, repo] = fullName.split('/')
    if (!owner || !repo) {
      toast.error('Invalid repository name')
      return
    }

    setIsPushing(true)
    try {
      const result = await github.pushReadme(owner, repo, generatedReadme)
      setResultUrl(result.url)
      setStep('done')
      toast.success('README.md pushed to GitHub!')
      setTimeout(() => setShowModal(false), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to push README'
      toast.error(message)
    } finally {
      setIsPushing(false)
    }
  }

  // If already pushed, show the "View on GitHub" link
  if (resultUrl && !showModal) {
    return (
      <a
        href={resultUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 ios-caption2 font-medium px-3 py-1.5 rounded-[8px] bg-dv-success/10 text-dv-success hover:bg-dv-success/15 transition-colors"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        View on GitHub
        <ExternalLink className="w-3 h-3" />
      </a>
    )
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={handleOpenModal}
        disabled={!docs}
        className="flex items-center gap-2 ios-caption2 font-medium px-3 py-1.5 rounded-[8px] bg-[var(--glass-6)] text-dv-text-muted hover:bg-[var(--glass-8)] transition-colors active:scale-[0.95] disabled:opacity-40 disabled:pointer-events-none"
      >
        <Upload className="w-3.5 h-3.5" />
        Push to GitHub
      </button>

      {/* Modal Overlay */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => !isGenerating && !isPushing && setShowModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl rounded-[16px] bg-[#1a1a2e] border border-dv-border shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-dv-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-dv-accent/15 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-dv-accent" />
                  </div>
                  <div>
                    <h3 className="ios-subhead font-semibold">Push README to GitHub</h3>
                    <p className="ios-caption2 text-dv-text-muted">{fullName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  disabled={isGenerating || isPushing}
                  className="p-1.5 rounded-[8px] text-dv-text-muted hover:bg-[var(--glass-6)] transition-colors disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <AnimatePresence mode="wait">
                  {/* Step 1: Describe */}
                  {step === 'describe' && (
                    <motion.div
                      key="describe"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="ios-caption1 font-medium text-dv-text-secondary block mb-2">
                          Describe your project <span className="text-dv-text-muted">(optional)</span>
                        </label>
                        <p className="ios-caption2 text-dv-text-muted mb-3">
                          Help us generate a better README by telling us about your project — 
                          what it does, who it&apos;s for, and what problems it solves.
                        </p>
                        <textarea
                          value={projectDescription}
                          onChange={(e) => setProjectDescription(e.target.value)}
                          placeholder="e.g., This is an ERP system for small manufacturing businesses. It helps track inventory, manage purchase orders, handle invoicing, and generate financial reports. Target users are factory managers and accountants."
                          rows={5}
                          className="w-full px-4 py-3 ios-caption1 bg-[var(--glass-4)] border border-dv-border rounded-[12px] focus:outline-none focus:border-dv-accent/40 placeholder:text-dv-text-muted/40 resize-none leading-relaxed"
                        />
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-dv-accent/5 border border-dv-accent/10">
                        <Sparkles className="w-3.5 h-3.5 text-dv-accent flex-shrink-0" />
                        <p className="ios-caption2 text-dv-text-secondary">
                          We&apos;ll generate a concise, developer-grade README — not the full detailed documentation.
                        </p>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 ios-caption2 text-dv-error">
                          <AlertCircle className="w-3.5 h-3.5" /> {error}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Preview */}
                  {step === 'preview' && generatedReadme && (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="ios-caption1 font-medium text-dv-text-secondary">
                          README Preview
                        </p>
                        <button
                          onClick={() => setStep('describe')}
                          className="ios-caption2 text-dv-accent hover:underline"
                        >
                          ← Edit description
                        </button>
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto rounded-[12px] bg-[var(--glass-4)] border border-dv-border p-4">
                        <pre className="ios-caption2 text-dv-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                          {generatedReadme}
                        </pre>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Done */}
                  {step === 'done' && (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-8 text-center"
                    >
                      <CheckCircle2 className="w-10 h-10 text-dv-success mb-3" />
                      <h4 className="ios-subhead font-semibold mb-1">README Pushed!</h4>
                      <p className="ios-caption2 text-dv-text-muted">
                        Your concise README has been pushed to GitHub.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              {step !== 'done' && (
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dv-border">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={isGenerating || isPushing}
                    className="px-4 py-2 ios-caption1 font-medium text-dv-text-muted rounded-[10px] hover:bg-[var(--glass-6)] transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>

                  {step === 'describe' && (
                    <button
                      onClick={handleGenerateReadme}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-5 py-2 ios-caption1 font-semibold rounded-[10px] bg-dv-accent text-white hover:bg-dv-accent/90 transition-colors active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating README…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate README
                        </>
                      )}
                    </button>
                  )}

                  {step === 'preview' && (
                    <button
                      onClick={handlePushToGithub}
                      disabled={isPushing}
                      className="flex items-center gap-2 px-5 py-2 ios-caption1 font-semibold rounded-[10px] bg-dv-success text-white hover:bg-dv-success/90 transition-colors active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {isPushing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Pushing…
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Push to GitHub
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
