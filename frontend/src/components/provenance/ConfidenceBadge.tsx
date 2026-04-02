'use client'

import clsx from 'clsx'

export function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100)
  const tone =
    pct >= 70 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : pct >= 45 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide uppercase',
        tone
      )}
    >
      <span className="opacity-80">Confidence</span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  )
}
