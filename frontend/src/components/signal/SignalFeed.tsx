'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Inbox, RefreshCw } from 'lucide-react'
import { signal as signalApi, SignalPacket } from '@/lib/api'
import SignalPacketCard from './SignalPacketCard'

const ease = [0.23, 1, 0.32, 1] as const

interface SignalFeedProps {
  repoId: string
  repoFullName?: string
}

export default function SignalFeed({ repoId, repoFullName }: SignalFeedProps) {
  const [packets, setPackets] = useState<SignalPacket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPackets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const resp = await signalApi.listPackets(repoId)
      setPackets(resp.packets || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signals')
    } finally {
      setIsLoading(false)
    }
  }, [repoId])

  useEffect(() => {
    fetchPackets()
  }, [fetchPackets])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mr-3" />
        <span className="text-[14px] text-[var(--text-muted)]">Loading signals…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-[var(--card-bg)] border border-red-500/15 p-8 text-center">
        <p className="text-[14px] text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchPackets}
          className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-secondary)] font-semibold text-[13px] px-4 py-2 rounded-xl hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    )
  }

  if (packets.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-12 text-center"
      >
        <Inbox className="w-10 h-10 text-[var(--text-faint)] mx-auto mb-4" />
        <p className="text-[16px] font-semibold text-[var(--text-secondary)] mb-2">No signals yet</p>
        <p className="text-[13px] text-[var(--text-muted)] max-w-md mx-auto">
          Import a customer ticket to generate your first Signal Packet with AI-powered code mapping and fix recommendations.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] tracking-[0.15em] uppercase text-[var(--text-muted)] font-medium">
          {packets.length} signal{packets.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={fetchPackets}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {packets.map((packet, i) => (
        <motion.div
          key={packet.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.4, ease }}
        >
          <SignalPacketCard
            packet={packet}
            repoFullName={repoFullName}
            onIssueCreated={fetchPackets}
          />
        </motion.div>
      ))}
    </div>
  )
}
