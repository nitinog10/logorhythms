'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Save, Settings } from 'lucide-react'
import { signal as signalApi, SignalConfig } from '@/lib/api'
import toast from 'react-hot-toast'

const ease = [0.23, 1, 0.32, 1] as const

interface SignalConfigFormProps {
  repoId: string
}

export default function SignalConfigForm({ repoId }: SignalConfigFormProps) {
  const [config, setConfig] = useState<SignalConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const fetchConfig = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await signalApi.getConfig(repoId)
      setConfig(data)
    } catch {
      setConfig({
        repo_id: repoId,
        source: 'manual',
        enabled: true,
        auto_create_issues: false,
        priority_threshold: 0.5,
      })
    } finally {
      setIsLoading(false)
    }
  }, [repoId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleSave = async () => {
    if (!config) return
    setIsSaving(true)
    try {
      await signalApi.updateConfig(repoId, config)
      toast.success('Configuration saved')
    } catch {
      toast.error('Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mr-3" />
        <span className="text-[14px] text-[var(--text-muted)]">Loading settings…</span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="max-w-xl"
    >
      <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
            <Settings className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Signal Settings</h3>
            <p className="text-[12px] text-[var(--text-muted)]">Configure ticket source and automation rules</p>
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--card-border)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Enable Signal</p>
            <p className="text-[12px] text-[var(--text-muted)]">Process incoming tickets for this repository</p>
          </div>
          <button
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              config.enabled ? 'bg-indigo-500' : 'bg-[var(--input-bg)]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Auto-create issues toggle */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--card-border)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Auto-create GitHub Issues</p>
            <p className="text-[12px] text-[var(--text-muted)]">Automatically create issues for high-urgency signals</p>
          </div>
          <button
            onClick={() => setConfig({ ...config, auto_create_issues: !config.auto_create_issues })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              config.auto_create_issues ? 'bg-indigo-500' : 'bg-[var(--input-bg)]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                config.auto_create_issues ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Priority threshold */}
        <div className="py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">Priority Threshold</p>
              <p className="text-[12px] text-[var(--text-muted)]">Minimum confidence score to flag a signal</p>
            </div>
            <span className="text-[14px] font-bold text-indigo-400 tabular-nums">
              {Math.round(config.priority_threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(config.priority_threshold * 100)}
            onChange={(e) => setConfig({ ...config, priority_threshold: Number(e.target.value) / 100 })}
            className="w-full h-1.5 rounded-full appearance-none bg-[var(--input-bg)] accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Integrations (future) */}
        <div className="py-3">
          <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">Integrations</p>
          <p className="text-[12px] text-[var(--text-muted)] mb-4">Connect external ticket sources</p>
          <div className="space-y-2">
            {(['Linear', 'Zendesk', 'Intercom'] as const).map((name) => (
              <div key={name} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--hover-bg)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] flex items-center justify-center text-[12px] font-bold text-[var(--text-muted)]">
                    {name[0]}
                  </div>
                  <span className="text-[14px] text-[var(--text-secondary)]">{name}</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] bg-[var(--input-bg)] px-2.5 py-1 rounded-md">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full inline-flex items-center justify-center gap-2 bg-white text-black font-semibold text-[14px] px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.98] transition-all duration-300 disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </motion.div>
  )
}
