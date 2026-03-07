'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Loader2,
  Globe,
  Lock,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { github } from '@/lib/api'
import toast from 'react-hot-toast'

interface CreateRepoModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateRepoModal({ isOpen, onClose, onCreated }: CreateRepoModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Repository name is required')
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      const result = await github.createRepo(name.trim(), description.trim(), isPrivate)
      setCreatedUrl(result.url)
      toast.success(`Repository "${result.full_name}" created!`)
      onCreated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create repository'
      setError(message)
      toast.error(message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(() => {
      setName('')
      setDescription('')
      setIsPrivate(false)
      setError(null)
      setCreatedUrl(null)
      onClose()
    }, 200)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-[var(--bar-bg)] backdrop-blur-sm z-50 transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={clsx(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md transition-all duration-200',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <div className="bg-dv-surface/80 backdrop-blur-ios border border-dv-border rounded-ios-xl shadow-ios-xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dv-border">
            <div>
              <h2 className="ios-title3 font-semibold">Create New Repository</h2>
              <p className="ios-caption1 text-dv-text-muted mt-1">
                Create a new GitHub repository
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[var(--glass-6)] flex items-center justify-center hover:bg-[var(--glass-10)] transition-colors active:scale-[0.92]"
            >
              <X className="w-4 h-4 text-dv-text-muted" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {createdUrl ? (
              /* Success state */
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-full bg-dv-success/15 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-dv-success" />
                </div>
                <p className="ios-subhead font-semibold mb-1">Repository Created!</p>
                <p className="ios-caption1 text-dv-text-muted mb-5">
                  Your new repository is ready on GitHub.
                </p>
                <a
                  href={createdUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 ios-caption1 font-medium text-dv-accent hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open on GitHub
                </a>
              </div>
            ) : (
              <>
                {/* Repo name */}
                <div>
                  <label className="ios-caption2 font-semibold text-dv-text-muted uppercase tracking-[0.04em] mb-2 block">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full bg-[var(--glass-4)] border border-dv-border rounded-[12px] py-3 px-4
                             text-dv-text placeholder:text-dv-text-muted ios-subhead
                             focus:outline-none focus:ring-2 focus:ring-dv-accent/30 focus:border-dv-accent/40 transition-all"
                    autoFocus
                    disabled={isCreating}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="ios-caption2 font-semibold text-dv-text-muted uppercase tracking-[0.04em] mb-2 block">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A short description of this repository"
                    rows={3}
                    className="w-full bg-[var(--glass-4)] border border-dv-border rounded-[12px] py-3 px-4
                             text-dv-text placeholder:text-dv-text-muted ios-subhead
                             focus:outline-none focus:ring-2 focus:ring-dv-accent/30 focus:border-dv-accent/40 transition-all resize-none"
                    disabled={isCreating}
                  />
                </div>

                {/* Visibility toggle */}
                <div>
                  <label className="ios-caption2 font-semibold text-dv-text-muted uppercase tracking-[0.04em] mb-2 block">
                    Visibility
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPrivate(false)}
                      disabled={isCreating}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[12px] ios-subhead font-medium border transition-all',
                        !isPrivate
                          ? 'bg-dv-accent/10 border-dv-accent/30 text-dv-accent'
                          : 'bg-[var(--glass-4)] border-dv-border text-dv-text-muted hover:bg-[var(--glass-6)]'
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      Public
                    </button>
                    <button
                      onClick={() => setIsPrivate(true)}
                      disabled={isCreating}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[12px] ios-subhead font-medium border transition-all',
                        isPrivate
                          ? 'bg-dv-purple/10 border-dv-purple/30 text-dv-purple'
                          : 'bg-[var(--glass-4)] border-dv-border text-dv-text-muted hover:bg-[var(--glass-6)]'
                      )}
                    >
                      <Lock className="w-4 h-4" />
                      Private
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-[10px] bg-dv-error/10 border border-dv-error/20">
                    <AlertCircle className="w-4 h-4 text-dv-error flex-shrink-0" />
                    <span className="ios-caption1 text-dv-error">{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-dv-border">
            {createdUrl ? (
              <button
                onClick={handleClose}
                className="btn-primary px-6 py-2.5 rounded-[12px] ios-subhead font-medium"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  disabled={isCreating}
                  className="btn-secondary px-5 py-2.5 rounded-[12px] ios-subhead font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !name.trim()}
                  className="btn-primary px-5 py-2.5 rounded-[12px] ios-subhead font-medium inline-flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isCreating ? 'Creating…' : 'Create Repository'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
