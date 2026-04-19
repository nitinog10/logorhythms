'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Layers, ChevronDown, AlertTriangle } from 'lucide-react'
import { signal as signalApi, SignalCluster, SignalUrgency } from '@/lib/api'

const ease = [0.23, 1, 0.32, 1] as const

const URGENCY_COLORS: Record<SignalUrgency, string> = {
  critical: 'text-red-400 bg-red-500/10',
  high: 'text-orange-400 bg-orange-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low: 'text-green-400 bg-green-500/10',
}

interface ClusterPanelProps {
  repoId: string
}

export default function ClusterPanel({ repoId }: ClusterPanelProps) {
  const [clusters, setClusters] = useState<SignalCluster[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchClusters = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await signalApi.listClusters(repoId)
      setClusters(data)
    } catch {
      // Silently handle — clusters may not exist yet
    } finally {
      setIsLoading(false)
    }
  }, [repoId])

  useEffect(() => {
    fetchClusters()
  }, [fetchClusters])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mr-3" />
        <span className="text-[14px] text-[var(--text-muted)]">Loading clusters…</span>
      </div>
    )
  }

  if (clusters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-12 text-center"
      >
        <Layers className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-4" />
        <p className="text-[16px] font-semibold text-[var(--text-secondary)] mb-2">No clusters yet</p>
        <p className="text-[13px] text-[var(--text-muted)] max-w-md mx-auto">
          Clusters are automatically created when similar signals are detected. Import more tickets to see clusters form.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <span className="text-[12px] tracking-[0.15em] uppercase text-[var(--text-muted)] font-medium">
        {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
      </span>

      {clusters.map((cluster, i) => {
        const urgencyClass = URGENCY_COLORS[cluster.combined_urgency]
        const isExpanded = expandedId === cluster.id

        return (
          <motion.div
            key={cluster.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease }}
            className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : cluster.id)}
              className="w-full text-left p-5 flex items-center gap-4"
            >
              {/* Cluster size badge */}
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/15 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-[18px] font-bold text-purple-400 tabular-nums">{cluster.size}</span>
                <span className="text-[9px] text-purple-400/60 uppercase font-medium -mt-0.5">tickets</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${urgencyClass}`}>
                    {cluster.combined_urgency}
                  </span>
                </div>
                <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                  {cluster.representative_title}
                </p>
              </div>

              <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                transition={{ duration: 0.3, ease }}
                className="border-t border-[var(--card-border)] px-5 pb-5 pt-4"
              >
                <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Signal IDs in this cluster
                </h4>
                <div className="space-y-1">
                  {cluster.signal_ids.map((sid) => (
                    <div key={sid} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hover-bg)]">
                      <AlertTriangle className="w-3 h-3 text-[var(--text-faint)]" />
                      <code className="text-[12px] text-[var(--text-secondary)] font-mono">{sid}</code>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
