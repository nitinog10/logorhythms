'use client'

import { useState } from 'react'
import {
  GitPullRequest,
  Loader2,
  ExternalLink,
  CheckCircle2,
  GitMerge,
  FileText,
} from 'lucide-react'
import { github, ImplementFixResponse } from '@/lib/api'
import toast from 'react-hot-toast'

interface ImplementFixButtonProps {
  owner: string
  repo: string
  suggestions: string[]
  impactSummary?: string
  baseBranch?: string
}

type Status = 'idle' | 'analyzing' | 'fixing' | 'pushing' | 'merging' | 'readme' | 'done'

export function ImplementFixButton({
  owner,
  repo,
  suggestions,
  impactSummary = '',
  baseBranch = 'main',
}: ImplementFixButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ImplementFixResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImplement = async () => {
    if (!suggestions.length) return

    setStatus('analyzing')
    setError(null)
    try {
      const res = await github.implementFix(
        owner,
        repo,
        suggestions,
        impactSummary,
        baseBranch
      )
      setResult(res)
      setStatus('done')

      const parts: string[] = [
        `PR #${res.pr_number} created`,
        `${res.files_changed} file(s) changed`,
      ]
      if (res.merged) parts.push('merged')
      if (res.readme_updated) parts.push('README updated')
      toast.success(parts.join(' · '))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to implement fix'
      setError(message)
      setStatus('idle')
      toast.error(message)
    }
  }

  if (status === 'done' && result) {
    return (
      <div className="flex flex-col gap-2">
        <a
          href={result.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-dv-success/10 text-dv-success hover:bg-dv-success/15 transition-all"
        >
          <CheckCircle2 className="w-3 h-3" />
          View PR #{result.pr_number}
          <ExternalLink className="w-3 h-3" />
        </a>
        <div className="flex items-center gap-3 text-[10px] text-dv-text/30">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {result.files_changed} file(s)
          </span>
          {result.merged && (
            <span className="flex items-center gap-1 text-dv-success">
              <GitMerge className="w-3 h-3" />
              Merged
            </span>
          )}
          {result.readme_updated && (
            <span className="flex items-center gap-1 text-dv-accent">
              <FileText className="w-3 h-3" />
              README updated
            </span>
          )}
        </div>
      </div>
    )
  }

  const isWorking = status !== 'idle' && status !== 'done'
  const statusLabels: Record<Status, string> = {
    idle: 'Auto-Fix Entire Codebase',
    analyzing: 'Analyzing codebase…',
    fixing: 'AI generating fixes…',
    pushing: 'Pushing changes…',
    merging: 'Merging PR…',
    readme: 'Updating README…',
    done: 'Done',
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleImplement}
        disabled={isWorking || !suggestions.length}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-dv-purple/10 text-dv-purple hover:bg-dv-purple/15 transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.95]"
      >
        {isWorking ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <GitPullRequest className="w-3 h-3" />
        )}
        {statusLabels[status]}
      </button>
      {error && (
        <span className="text-[10px] text-dv-error">{error}</span>
      )}
    </div>
  )
}
