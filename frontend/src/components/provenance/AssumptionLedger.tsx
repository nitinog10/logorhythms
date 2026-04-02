'use client'

import { AlertTriangle, ShieldQuestion } from 'lucide-react'
import type { AssumptionEntry, StaleAssumptionAlert } from '@/lib/api'
import clsx from 'clsx'

export function AssumptionLedger({
  assumptions,
  stale,
}: {
  assumptions: AssumptionEntry[]
  stale: StaleAssumptionAlert[]
}) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
          <ShieldQuestion className="w-3.5 h-3.5" />
          Assumptions
        </h3>
        {assumptions.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">No explicit assumptions extracted.</p>
        ) : (
          <ul className="space-y-2">
            {assumptions.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3"
              >
                <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">{a.statement}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span
                    className={clsx(
                      'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                      a.status === 'likely_stale' || a.status === 'superseded'
                        ? 'text-amber-400 border-amber-500/25 bg-amber-500/5'
                        : 'text-[var(--text-muted)] border-[var(--input-border)]'
                    )}
                  >
                    {a.status.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                    {Math.round(a.confidence * 100)}% model confidence
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-amber-400/90 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Stale or risky assumptions
        </h3>
        {stale.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">No stale-assumption warnings for this target.</p>
        ) : (
          <ul className="space-y-2">
            {stale.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3"
              >
                <p className="text-[14px] text-[var(--text-primary)] font-medium">{s.statement}</p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">{s.reason}</p>
                <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-amber-400/80 font-semibold">
                  {s.severity} signal
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
