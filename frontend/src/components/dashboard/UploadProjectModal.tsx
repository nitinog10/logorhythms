'use client'

import { useState, useRef } from 'react'
import {
  X,
  Upload,
  Loader2,
  FileArchive,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { upload } from '@/lib/api'
import toast from 'react-hot-toast'

interface UploadProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onUploaded?: () => void
}

export function UploadProjectModal({ isOpen, onClose, onUploaded }: UploadProjectModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [description, setDescription] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Trigger enter animation
  if (isOpen && !visible) {
    requestAnimationFrame(() => setVisible(true))
  }
  if (!isOpen && visible) {
    setVisible(false)
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(() => {
      onClose()
      setFile(null)
      setProjectName('')
      setDescription('')
      setError(null)
    }, 200)
  }

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.zip')) {
      setError('Only .zip files are accepted')
      return
    }
    if (selected.size > 100 * 1024 * 1024) {
      setError('File exceeds maximum size of 100 MB')
      return
    }
    setFile(selected)
    setError(null)
    if (!projectName) {
      setProjectName(selected.name.replace(/\.zip$/i, ''))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    handleFileSelect(dropped || null)
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    try {
      await upload.uploadZip(file, projectName, description)
      toast.success('Project uploaded! Indexing started…')
      onUploaded?.()
      handleClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      toast.error(message)
    } finally {
      setIsUploading(false)
    }
  }

  if (!isOpen) return null

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
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg transition-all duration-200',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <div className="bg-[var(--card-bg)] backdrop-blur-2xl border border-[var(--card-border)] rounded-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--text-faint)]">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Upload Code Folder</h2>
              <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                Upload a ZIP file of your project
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[var(--input-bg)] flex items-center justify-center hover:bg-[var(--input-border)] transition-colors active:scale-[0.92]"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Drop zone + fields */}
          <div className="p-6 space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200',
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : file
                    ? 'border-green-500/40 bg-green-500/5'
                    : 'border-[var(--input-border)] hover:border-indigo-500/40 hover:bg-[var(--hover-bg)]'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />

              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
                    <FileArchive className="w-6 h-6 text-green-400" />
                  </div>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{file.name}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                    className="text-[12px] text-red-400 hover:underline mt-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--input-bg)] flex items-center justify-center">
                    <Upload className="w-7 h-7 text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--text-secondary)]">
                      Drag & drop your ZIP file here
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1">
                      or click to browse · max 100 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Project name */}
            <div>
              <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-project"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all"
              />
            </div>

            {/* Description (optional) */}
            <div>
              <label className="text-[12px] font-medium text-[var(--text-muted)] block mb-1.5">
                Description <span className="text-[var(--text-faint)]">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of your project"
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 pt-0">
            <button
              onClick={handleClose}
              className="text-[13px] font-medium px-5 py-2.5 rounded-full bg-[var(--input-bg)] text-[var(--text-muted)] hover:bg-[var(--input-border)] transition-all active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="flex items-center gap-2 text-[13px] font-semibold bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300 shadow-[var(--btn-solid-shadow)] disabled:opacity-40 disabled:pointer-events-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Upload & Analyze
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
