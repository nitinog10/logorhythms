'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Crown, ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { billing, type SubscribeResponse } from '@/lib/api'
import { useUserStore } from '@/lib/store'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: string
  used?: number
  limit?: number
}

const FEATURE_LABELS: Record<string, string> = {
  walkthroughs: 'AI Walkthroughs',
  signals: 'Signal Packets',
  provenance: 'Provenance Cards',
  explains: 'Inline Explanations',
  repos: 'Connected Repositories',
  diagrams: 'Architecture Diagrams',
}

export default function UpgradeModal({ isOpen, onClose, feature, used, limit }: UpgradeModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const subscription = useUserStore((s) => s.subscription)

  const handleUpgrade = useCallback(async () => {
    setLoading(true)
    try {
      const subData: SubscribeResponse = await billing.subscribe('pro')

      if (!window.Razorpay) {
        alert('Payment gateway is loading. Please try again.')
        setLoading(false)
        return
      }

      const options = {
        key: subData.razorpay_key_id,
        order_id: subData.order_id,
        amount: subData.amount_in_paise,
        currency: subData.currency,
        name: subData.name,
        description: subData.description,
        handler: async (response: any) => {
          try {
            const result = await billing.verify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              plan: subData.tier || 'pro',
            })

            if (result.success) {
              const subInfo = await billing.getSubscription()
              useUserStore.getState().setSubscription({
                tier: subInfo.tier,
                status: subInfo.status,
                usage: subInfo.usage,
                limits: subInfo.limits,
                periodEnd: subInfo.current_period_end,
                currency: subInfo.currency,
              })
              onClose()
            }
          } catch (err) {
            console.error('Verification failed:', err)
          }
        },
        theme: { color: '#6366f1' },
        modal: { ondismiss: () => setLoading(false) },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      console.error('Subscribe error:', err)
      setLoading(false)
    }
  }, [onClose])

  const featureLabel = feature ? FEATURE_LABELS[feature] || feature : 'this feature'
  const usagePercent = used && limit ? Math.min((used / limit) * 100, 100) : 100

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md bg-[#0f0f14] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
            initial={{ scale: 0.9, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 25 }}
          >
            {/* Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-purple-500/20 blur-3xl rounded-full" />

            <div className="relative p-6 sm:p-8">
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4 text-white/30" />
              </button>

              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
                <Crown className="w-6 h-6 text-purple-400" />
              </div>

              <h3 className="text-xl font-bold tracking-[-0.02em] mb-2">
                Upgrade to Pro
              </h3>

              <p className="text-[14px] text-white/40 mb-5 leading-relaxed">
                You've reached the free tier limit for <span className="text-white/70">{featureLabel}</span>.
                Upgrade to Pro for more power.
              </p>

              {/* Usage bar */}
              {used !== undefined && limit !== undefined && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-white/30">{featureLabel} used</span>
                    <span className="text-[12px] text-white/50 font-mono">{used}/{limit}</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="w-full py-3 bg-white text-black rounded-xl text-[14px] font-semibold hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Upgrade to Pro
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  onClick={() => { onClose(); router.push('/pricing') }}
                  className="w-full py-3 bg-white/[0.04] text-white/50 rounded-xl text-[14px] hover:bg-white/[0.06] transition-colors"
                >
                  Compare all plans
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
