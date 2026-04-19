'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bug,
  HelpCircle,
  Zap,
  Shield,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode,
  Copy,
  Check,
  GitBranch,
} from 'lucide-react'
import { SignalPacket, SignalUrgency, SignalIssueType, signal as signalApi } from '@/lib/api'
import toast from 'react-hot-toast'

const ease = [0.23, 1, 0.32, 1] as const

const URGENCY_COLORS: Record<SignalUrgency, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
}

const ISSUE_ICONS: Record<SignalIssueType, React.ReactNode> = {
  bug: <Bug className="w-4 h-4" />,
  feature_request: <Sparkles className="w-4 h-4" />,
  question: <HelpCircle className="w-4 h-4" />,
  performance: <Zap className="w-4 h-4" />,
  ux: <Layers className="w-4 h-4" />,
  security: <Shield className="w-4 h-4" />,
  other: <AlertTriangle className="w-4 h-4" />,
}

interface SignalPacketCardProps {
  packet: SignalPacket
  repoFullName?: string
  onIssueCreated?: () => void
}

export default function SignalPacketCard({ packet, repoFullName, onIssueCreated }: SignalPacketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCreatingIssue, setIsCreatingIssue] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const urgencyStyle = URGENCY_COLORS[packet.business_urgency]
  const issueIcon = ISSUE_ICONS[packet.issue_type]
  const confidencePercent = Math.round(packet.confidence_score * 100)

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleCreateIssue = async () => {
    if (!repoFullName) {
      toast.error('Repository information not available')
      return
    }
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return

    setIsCreatingIssue(true)
    try {
      const result = await signalApi.createIssueFromPacket(
        packet.repo_id,
        packet.id,
        owner,
        repo,
      )
      toast.success(`Issue #${result.issue_number} created`)
      onIssueCreated?.()
    } catch {
      toast.error('Failed to create GitHub issue')
    } finally {
      setIsCreatingIssue(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden hover:border-[var(--input-border)] transition-colors"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-5 flex items-start gap-4"
      >
        {/* Issue type icon */}
        <div className={`w-10 h-10 rounded-xl ${urgencyStyle.bg} border ${urgencyStyle.border} flex items-center justify-center flex-shrink-0 ${urgencyStyle.text}`}>
          {issueIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Urgency badge */}
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${urgencyStyle.bg} ${urgencyStyle.text}`}>
              {packet.business_urgency}
            </span>
            {/* Issue type */}
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--input-bg)] text-[var(--text-secondary)]">
              {packet.issue_type.replace('_', ' ')}
            </span>
            {/* Duplicates */}
            {packet.duplicate_count > 1 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 text-purple-400">
                {packet.duplicate_count} duplicates
              </span>
            )}
            {/* GitHub issue link */}
            {packet.github_issue_url && (
              <a
                href={packet.github_issue_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1"
              >
                <GitBranch className="w-3 h-3" /> #{packet.github_issue_number}
              </a>
            )}
          </div>

          <p className="text-[14px] font-medium text-[var(--text-primary)] line-clamp-1">
            {packet.fix_summary || packet.root_cause_hypothesis || 'Investigation needed'}
          </p>

          {/* Confidence bar */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--input-bg)] overflow-hidden max-w-[120px]">
              <div
                className={`h-full rounded-full transition-all ${
                  confidencePercent >= 70 ? 'bg-green-400' : confidencePercent >= 40 ? 'bg-yellow-400' : 'bg-red-400'
                }`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{confidencePercent}%</span>
            {packet.likely_files.length > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">
                · {packet.likely_files.length} file{packet.likely_files.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className={`w-6 h-6 flex items-center justify-center text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5 border-t border-[var(--card-border)] pt-5">
              {/* Root cause */}
              {packet.root_cause_hypothesis && (
                <div>
                  <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Root Cause Hypothesis</h4>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed bg-[var(--hover-bg)] rounded-xl p-3">
                    {packet.root_cause_hypothesis}
                  </p>
                </div>
              )}

              {/* Fix summary */}
              {packet.fix_summary && (
                <div>
                  <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Fix Plan</h4>
                  <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed bg-[var(--hover-bg)] rounded-xl p-3 whitespace-pre-wrap">
                    {packet.fix_summary}
                  </div>
                </div>
              )}

              {/* Code matches */}
              {packet.likely_files.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Likely Code Areas</h4>
                  <div className="space-y-1">
                    {packet.code_matches.slice(0, 5).map((match, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hover-bg)]">
                        <FileCode className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="text-[13px] text-[var(--text-primary)] font-mono truncate">{match.file_path}</span>
                        {match.symbol && (
                          <span className="text-[11px] text-purple-400 font-mono">{match.symbol}</span>
                        )}
                        <span className="ml-auto text-[11px] text-[var(--text-muted)] tabular-nums">{Math.round(match.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Owner suggestions */}
              {packet.owner_suggestions.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Suggested Owner</h4>
                  <div className="flex flex-wrap gap-2">
                    {packet.owner_suggestions.map((owner, i) => (
                      <span key={i} className="px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-[12px] font-medium">
                        {owner}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer response draft */}
              {packet.customer_response_draft && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Customer Response Draft</h4>
                    <button
                      onClick={() => handleCopy(packet.customer_response_draft, 'response')}
                      className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
                    >
                      {copiedField === 'response' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedField === 'response' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed bg-[var(--hover-bg)] rounded-xl p-3 italic">
                    {packet.customer_response_draft}
                  </p>
                </div>
              )}

              {/* Docs update suggestions */}
              {packet.docs_update_suggestions.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Documentation Updates</h4>
                  <ul className="space-y-1">
                    {packet.docs_update_suggestions.map((s, i) => (
                      <li key={i} className="text-[13px] text-[var(--text-secondary)] flex items-start gap-2">
                        <ChevronRight className="w-3 h-3 mt-1 text-[var(--text-faint)] flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {!packet.github_issue_url && (
                  <button
                    onClick={handleCreateIssue}
                    disabled={isCreatingIssue}
                    className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[13px] px-5 py-2 rounded-full hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300 disabled:opacity-40"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    {isCreatingIssue ? 'Creating…' : 'Create GitHub Issue'}
                  </button>
                )}
                {packet.github_issue_url && (
                  <a
                    href={packet.github_issue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 font-semibold text-[13px] px-5 py-2 rounded-full hover:bg-green-500/20 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Issue #{packet.github_issue_number}
                  </a>
                )}
                <button
                  onClick={() => handleCopy(JSON.stringify(packet, null, 2), 'packet')}
                  className="inline-flex items-center gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-secondary)] font-semibold text-[13px] px-4 py-2 rounded-full hover:text-[var(--text-primary)] transition-colors"
                >
                  {copiedField === 'packet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedField === 'packet' ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
