'use client'

import { ConfidenceBadge } from './ConfidenceBadge'
import { EvidenceTimeline } from './EvidenceTimeline'
import { AssumptionLedger } from './AssumptionLedger'
import type { ProvenanceCard as Card } from '@/lib/api'

export function ProvenanceCardView({
  card,
  onFeedback,
}: {
  card: Card
  onFeedback?: (rating: 'correct' | 'partially_correct' | 'wrong') => void
}) {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)] font-semibold mb-1">
            Provenance
          </p>
          <h2 className="text-[clamp(1.25rem,2.5vw,1.6rem)] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            {card.symbol ? (
              <>
                <span className="text-indigo-400">{card.symbol}</span>
                <span className="text-[var(--text-muted)] font-normal"> in </span>
              </>
            ) : null}
            <span className="font-mono text-[0.92em]">{card.file_path}</span>
          </h2>
          {card.symbol_type ? (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Symbol type: {card.symbol_type}</p>
          ) : null}
        </div>
        <ConfidenceBadge score={card.confidence_score} />
      </div>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-2">What it does now</h3>
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            {card.current_purpose}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-2">Origin & decisions</h3>
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            {card.origin_summary}
          </p>
          {card.decision_summary ? (
            <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap mt-3 pt-3 border-t border-[var(--card-border)]">
              {card.decision_summary}
            </p>
          ) : null}
        </div>
      </section>

      {card.safe_change_notes?.length ? (
        <section className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.04] p-5">
          <h3 className="text-[13px] font-semibold text-indigo-300 mb-3">Safe-change notes</h3>
          <ul className="list-disc list-inside space-y-1.5 text-[14px] text-[var(--text-secondary)]">
            {card.safe_change_notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.decision_threads?.length ? (
        <section>
          <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[var(--text-muted)] mb-3">
            Related decision threads
          </h3>
          <ul className="space-y-2">
            {card.decision_threads.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--hover-bg)] px-4 py-3 text-[14px] text-[var(--text-secondary)]"
              >
                {t.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid lg:grid-cols-2 gap-8 lg:gap-10">
        <div>
          <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[var(--text-muted)] mb-4">
            Evidence timeline
          </h3>
          <EvidenceTimeline items={card.evidence_links} />
        </div>
        <div>
          <AssumptionLedger assumptions={card.assumptions} stale={card.stale_assumptions} />
        </div>
      </section>

      {onFeedback ? (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-[var(--text-secondary)]">Was this helpful?</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onFeedback('correct')}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors"
            >
              Correct
            </button>
            <button
              type="button"
              onClick={() => onFeedback('partially_correct')}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-colors"
            >
              Partially correct
            </button>
            <button
              type="button"
              onClick={() => onFeedback('wrong')}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 transition-colors"
            >
              Wrong
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
