'use client'

import { GitCommit, GitPullRequest, CircleDot, Link2 } from 'lucide-react'
import type { EvidenceLink } from '@/lib/api'
import clsx from 'clsx'

const icon = (t: string) => {
  switch (t) {
    case 'pull_request':
      return <GitPullRequest className="w-3.5 h-3.5" />
    case 'commit':
      return <GitCommit className="w-3.5 h-3.5" />
    case 'issue':
      return <CircleDot className="w-3.5 h-3.5" />
    default:
      return <Link2 className="w-3.5 h-3.5" />
  }
}

export function EvidenceTimeline({ items }: { items: EvidenceLink[] }) {
  const filtered = items.filter((e) => e.source_url)
  if (!filtered.length) {
    return (
      <p className="text-[13px] text-[var(--text-muted)]">No grounded evidence links for this path yet.</p>
    )
  }

  return (
    <ol className="space-y-3">
      {filtered.map((e, i) => (
        <li
          key={e.id}
          className={clsx(
            'relative pl-9 pr-2 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60',
            i < filtered.length - 1 && 'mb-0'
          )}
        >
          <span className="absolute left-3 top-3 text-indigo-400/90">{icon(e.source_type)}</span>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {e.source_type.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-[var(--text-faint)]">·</span>
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
              {Math.round(e.confidence * 100)}% weight
            </span>
          </div>
          {e.source_url ? (
            <a
              href={e.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] font-medium text-[var(--text-primary)] hover:text-indigo-400 transition-colors"
            >
              {e.title || e.source_url}
            </a>
          ) : (
            <p className="text-[14px] font-medium text-[var(--text-primary)]">{e.title}</p>
          )}
          {e.excerpt ? (
            <p className="text-[12px] text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-4">
              {e.excerpt}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
