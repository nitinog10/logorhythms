'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Plus,
  Loader2,
  Globe,
  Lock,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Upload,
  FileArchive,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { github } from '@/lib/api'
import type { CreateRepoWithUploadResponse } from '@/lib/api'
import toast from 'react-hot-toast'

interface CreateRepoModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

type ProgressStep = 'idle' | 'creating' | 'uploading' | 'done'

export function CreateRepoModal({ isOpen, onClose, onCreated }: CreateRepoModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  // ZIP upload state
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progressStep, setProgressStep] = useState<ProgressStep>('idle')
  const [filesPushed, setFilesPushed] = useState(0)
  const [repoId, setRepoId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      if (file.size > 100 * 1024 * 1024) {
        setError('ZIP file must be under 100 MB')
        return
      }
      setZipFile(file)
      setError(null)
    } else {
      setError('Only .zip files are accepted')
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      if (file.size > 100 * 1024 * 1024) {
        setError('ZIP file must be under 100 MB')
        return
      }
      setZipFile(file)
      setError(null)
    } else if (file) {
      setError('Only .zip files are accepted')
    }
    e.target.value = ''
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Repository name is required')
      return
    }
    setIsCreating(true)
    setError(null)

    try {
      if (zipFile) {
        setProgressStep('creating')
        await new Promise((r) => setTimeout(r, 300))
        setProgressStep('uploading')

        const result: CreateRepoWithUploadResponse = await github.createRepoWithUpload(
          name.trim(),
          description.trim(),
          isPrivate,
          zipFile,
        )
        setCreatedUrl(result.url)
        setFilesPushed(result.files_pushed)
        setRepoId(result.repository_id)
        setProgressStep('done')
        toast.success(`Repository "${result.full_name}" created with ${result.files_pushed} files!`)
        onCreated?.()
      } else {
        setProgressStep('creating')
        const result = await github.createRepo(name.trim(), description.trim(), isPrivate)
        setCreatedUrl(result.url)
        setProgressStep('done')
        toast.success(`Repository "${result.full_name}" created!`)
        onCreated?.()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create repository'
      setError(message)
      setProgressStep('idle')
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
      setZipFile(null)
      setProgressStep('idle')
      setFilesPushed(0)
      setRepoId(null)
      onClose()
    }, 200)
  }

  if (!isOpen) return null

  const progressLabel =
    progressStep === 'creating'
      ? 'Creating repository…'
      : progressStep === 'uploading'
        ? 'Uploading files to GitHub…'
        : 'Create Repository'

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-200',
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
        <div className="bg-[var(--card-bg)] backdrop-blur-2xl border border-[var(--card-border)] rounded-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--text-faint)]">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Create New Repository</h2>
              <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                Create a new GitHub repository
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center hover:bg-[var(--input-border)] transition-colors active:scale-[0.92]"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {createdUrl ? (
              /* Success state */
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">Repository Created!</p>
                <p className="text-[13px] text-[var(--text-muted)] mb-3">
                  {filesPushed > 0
                    ? `${filesPushed} files pushed to GitHub and connected to DocuVerse.`
                    : 'Your new repository is ready on GitHub.'}
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href={createdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[13px] font-medium text-indigo-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open on GitHub
                  </a>
                  {repoId && (
                    <a
                      href={`/repository/${repoId}`}
                      className="inline-flex items-center gap-2 text-[13px] font-medium text-purple-400 hover:underline"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      View in DocuVerse
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Repo name */}
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2 block">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl py-3 px-4
                             text-[var(--text-primary)] placeholder:text-[var(--text-faint)] text-[14px]
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition-all"
                    autoFocus
                    disabled={isCreating}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2 block">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A short description of this repository"
                    rows={3}
                    className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl py-3 px-4
                             text-[var(--text-primary)] placeholder:text-[var(--text-faint)] text-[14px]
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition-all resize-none"
                    disabled={isCreating}
                  />
                </div>

                {/* Visibility toggle */}
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2 block">
                    Visibility
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPrivate(false)}
                      disabled={isCreating}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all',
                        !isPrivate
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                          : 'bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      Public
                    </button>
                    <button
                      onClick={() => setIsPrivate(true)}
                      disabled={isCreating}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all',
                        isPrivate
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                          : 'bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
                      )}
                    >
                      <Lock className="w-4 h-4" />
                      Private
                    </button>
                  </div>
                </div>

                {/* ZIP Upload (optional) */}
                <div>
                  <label className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-2 block">
                    Upload Project Files{' '}
                    <span className="normal-case font-normal text-[var(--text-faint)]">(optional)</span>
                  </label>

                  {zipFile ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                      <FileArchive className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{zipFile.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {(zipFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <button
                        onClick={() => setZipFile(null)}
                        disabled={isCreating}
                        className="w-7 h-7 rounded-full bg-[var(--input-bg)] flex items-center justify-center
                                 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={clsx(
                        'flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all',
                        dragOver
                          ? 'border-indigo-500 bg-indigo-500/5'
                          : 'border-[var(--input-border)] hover:border-indigo-500/40 hover:bg-[var(--hover-bg)]',
                        isCreating && 'pointer-events-none opacity-50',
                      )}
                    >
                      <Upload className="w-5 h-5 text-[var(--text-muted)]" />
                      <p className="text-[13px] text-[var(--text-muted)] text-center">
                        Drop a <span className="font-medium text-[var(--text-primary)]">.zip</span> file here or{' '}
                        <span className="text-indigo-400 font-medium">browse</span>
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)]">
                        Files will be pushed directly to the new repository
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-[13px] text-red-400">{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--text-faint)]">
            {createdUrl ? (
              <button
                onClick={handleClose}
                className="bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[13px] px-6 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  disabled={isCreating}
                  className="text-[13px] font-medium px-5 py-2.5 rounded-full bg-[var(--input-bg)] text-[var(--text-muted)] hover:bg-[var(--input-border)] transition-all active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !name.trim()}
                  className="inline-flex items-center gap-2 bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[13px] px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isCreating ? progressLabel : (zipFile ? 'Create & Upload' : 'Create Repository')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
