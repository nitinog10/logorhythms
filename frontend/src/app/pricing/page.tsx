'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  X,
  Sparkles,
  Crown,
  Users,
  ArrowRight,
  Shield,
  Zap,
  Star,
  ChevronDown,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { billing, type GeoPricing, type SubscribeResponse } from '@/lib/api'
import { useUserStore } from '@/lib/store'
import GradientMesh from '@/components/landing/GradientMesh'
import Script from 'next/script'

const ease = [0.23, 1, 0.32, 1] as const

/* ─── Razorpay type ─── */
declare global {
  interface Window {
    Razorpay: any
  }
}

/* ─── Plan data for comparison grid ─── */
const COMPARISON_ROWS = [
  { label: 'Connected Repositories', free: '5', pro: 'Unlimited', team: 'Unlimited' },
  { label: 'AI Walkthroughs / month', free: '5 files', pro: '100 files', team: 'Unlimited' },
  { label: 'Architecture Diagrams', free: 'Unlimited', pro: 'Unlimited', team: 'Unlimited' },
  { label: 'Signal Packets / month', free: '3', pro: '50', team: 'Unlimited' },
  { label: 'Provenance Cards / month', free: '3', pro: '30', team: 'Unlimited' },
  { label: 'Inline Explain', free: '10 / day', pro: 'Unlimited', team: 'Unlimited' },
  { label: 'Audio Narration', free: 'Browser TTS', pro: 'ElevenLabs HD', team: 'ElevenLabs HD' },
  { label: 'API & MCP Access', free: false, pro: true, team: true },
  { label: 'Priority Support', free: false, pro: true, team: true },
  { label: 'Team Collaboration', free: false, pro: false, team: true },
]

const FAQ_ITEMS = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes! You can upgrade or downgrade at any time. When upgrading, you get instant access to your new plan. When downgrading, you retain access until the end of your billing period.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept UPI, all major credit/debit cards, net banking, and popular wallets via Razorpay. International cards are also supported for USD payments.',
  },
  {
    q: 'Is there a free trial for Pro?',
    a: 'The Free tier itself is our trial — you can use DocuVerse with generous limits before deciding to upgrade. No credit card required to get started.',
  },
  {
    q: 'What happens when I hit my free tier limit?',
    a: "You'll see a friendly upgrade prompt. Your existing walkthroughs and data remain accessible — you just can't generate new ones until you upgrade or wait for the next billing cycle.",
  },
  {
    q: 'Can I cancel anytime?',
    a: "Absolutely. Cancel from your Settings page at any time. You'll retain Pro/Team access until the end of your current billing period.",
  },
]

export default function PricingPage() {
  const { isAuthenticated, subscription } = useUserStore()
  const router = useRouter()
  const [geo, setGeo] = useState<GeoPricing | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)

  const currentTier = subscription?.tier || 'free'

  // Detect geo-pricing
  useEffect(() => {
    billing.getGeo().then(setGeo).catch(() => {
      // Fallback pricing
      setGeo({
        country: 'IN',
        country_name: 'India',
        currency: 'INR',
        symbol: '₹',
        plans: {
          currency: 'INR',
          symbol: '₹',
          free: { amount: 0, display: 'Free', features: [] },
          pro: { amount: 799, display: '₹799/mo', features: [], symbol: '₹' },
          team: { amount: 1499, display: '₹1,499/mo', features: [], symbol: '₹' },
        },
      })
    }).finally(() => setLoading(false))
  }, [])

  const handleSubscribe = useCallback(async (plan: 'pro' | 'team') => {
    if (!isAuthenticated) {
      router.push('/auth/signin')
      return
    }

    if (currentTier === plan) return

    setSubscribing(plan)

    try {
      const subData: SubscribeResponse = await billing.subscribe(plan)

      if (!window.Razorpay) {
        alert('Payment gateway is loading. Please try again in a moment.')
        setSubscribing(null)
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
              plan: subData.tier || plan,
            })

            if (result.success) {
              // Refresh subscription state
              const subInfo = await billing.getSubscription()
              useUserStore.getState().setSubscription({
                tier: subInfo.tier,
                status: subInfo.status,
                usage: subInfo.usage,
                limits: subInfo.limits,
                periodEnd: subInfo.current_period_end,
                currency: subInfo.currency,
              })
              router.push('/dashboard')
            }
          } catch (err) {
            console.error('Payment verification failed:', err)
            alert('Payment verification failed. Please contact support.')
          }
        },
        prefill: {},
        theme: {
          color: '#6366f1',
        },
        modal: {
          ondismiss: () => setSubscribing(null),
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      console.error('Subscribe error:', err)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setSubscribing(null)
    }
  }, [isAuthenticated, currentTier, router])

  const symbol = geo?.symbol || '₹'
  const proPrice = geo?.plans?.pro?.amount || 799
  const teamPrice = geo?.plans?.team?.amount || 1499

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
      />

      <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden selection:bg-indigo-500/30">
        {/* ─── Header ─── */}
        <header className="fixed top-0 inset-x-0 z-50 bg-[#050505]/80 backdrop-blur-2xl border-b border-white/[0.06]">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <img src="/logo.png" alt="DocuVerse" className="w-7 h-7 rounded-lg object-cover" />
              <span className="text-[15px] font-semibold tracking-tight text-white/80 group-hover:text-white transition-colors">
                DocuVerse
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href={isAuthenticated ? '/dashboard' : '/auth/signin'}
                className="text-[13px] text-white/40 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {isAuthenticated ? 'Dashboard' : 'Sign in'}
              </Link>
            </div>
          </div>
        </header>

        {/* ─── Hero ─── */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
          <GradientMesh className="opacity-40" />

          <div className="relative z-10 max-w-4xl mx-auto text-center px-6">
            <motion.span
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-indigo-400/70 mb-6 font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease }}
            >
              <span className="w-8 h-[1px] bg-indigo-500/50" />
              Pricing
            </motion.span>

            <motion.h1
              className="text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.1 }}
            >
              Simple, transparent pricing
            </motion.h1>

            <motion.p
              className="text-lg text-white/30 max-w-lg mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.2 }}
            >
              Start free. Upgrade when you need more power. No hidden fees, cancel anytime.
            </motion.p>
          </div>
        </section>

        {/* ─── Pricing Cards ─── */}
        <section className="relative pb-20 sm:pb-28">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-10">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.3 }}
              >
                {/* ── FREE ── */}
                <PricingCard
                  name="Free"
                  price="0"
                  symbol={symbol}
                  period=""
                  description="Perfect for exploring DocuVerse"
                  icon={<Zap className="w-6 h-6" />}
                  accentColor="#6366f1"
                  features={[
                    '5 repositories',
                    '5 walkthroughs / month',
                    'Unlimited diagrams',
                    '3 Signal packets / month',
                    'Browser TTS audio',
                    '10 Inline Explains / day',
                  ]}
                  isCurrent={currentTier === 'free'}
                  onSelect={() => {}}
                  ctaText={currentTier === 'free' ? 'Current Plan' : 'Downgrade'}
                  disabled={currentTier === 'free'}
                />

                {/* ── PRO ── */}
                <PricingCard
                  name="Pro"
                  price={proPrice.toLocaleString()}
                  symbol={symbol}
                  period="/mo"
                  description="For developers who ship fast"
                  icon={<Crown className="w-6 h-6" />}
                  accentColor="#a855f7"
                  isPopular
                  features={[
                    'Unlimited repositories',
                    '100 walkthroughs / month',
                    'Unlimited diagrams',
                    '50 Signal packets / month',
                    'ElevenLabs HD audio',
                    'Unlimited Inline Explain',
                    'API & MCP access',
                    'Priority support',
                  ]}
                  isCurrent={currentTier === 'pro'}
                  isLoading={subscribing === 'pro'}
                  onSelect={() => handleSubscribe('pro')}
                  ctaText={currentTier === 'pro' ? 'Current Plan' : currentTier === 'team' ? 'Downgrade to Pro' : 'Upgrade to Pro'}
                  disabled={currentTier === 'pro'}
                />

                {/* ── TEAM ── */}
                <PricingCard
                  name="Team"
                  price={teamPrice.toLocaleString()}
                  symbol={symbol}
                  period="/mo per seat"
                  description="For engineering teams"
                  icon={<Users className="w-6 h-6" />}
                  accentColor="#22d3ee"
                  features={[
                    'Everything in Pro, plus:',
                    'Unlimited walkthroughs',
                    'Unlimited Signal packets',
                    'Unlimited Provenance cards',
                    'Team collaboration',
                    'ElevenLabs HD audio',
                    'API & MCP access',
                    'Priority support',
                  ]}
                  isCurrent={currentTier === 'team'}
                  isLoading={subscribing === 'team'}
                  onSelect={() => handleSubscribe('team')}
                  ctaText={currentTier === 'team' ? 'Current Plan' : 'Upgrade to Team'}
                  disabled={currentTier === 'team'}
                />
              </motion.div>
            )}
          </div>
        </section>

        {/* ─── Feature Comparison ─── */}
        <section className="relative py-20 sm:py-28 border-t border-white/[0.04]">
          <div className="max-w-[1000px] mx-auto px-6 sm:px-10">
            <motion.h2
              className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-center mb-12"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Feature comparison
            </motion.h2>

            <motion.div
              className="rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0f]"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              {/* Header */}
              <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-white/[0.02] border-b border-white/[0.06]">
                <div className="text-[13px] text-white/30 font-medium">Feature</div>
                <div className="text-[13px] text-white/50 font-semibold text-center">Free</div>
                <div className="text-[13px] text-purple-400 font-semibold text-center">Pro</div>
                <div className="text-[13px] text-cyan-400 font-semibold text-center">Team</div>
              </div>

              {/* Rows */}
              {COMPARISON_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-4 gap-4 px-6 py-3.5 ${i < COMPARISON_ROWS.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                >
                  <div className="text-[13px] text-white/60">{row.label}</div>
                  <ComparisonCell value={row.free} />
                  <ComparisonCell value={row.pro} />
                  <ComparisonCell value={row.team} />
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="relative py-20 sm:py-28 border-t border-white/[0.04]">
          <div className="max-w-[700px] mx-auto px-6 sm:px-10">
            <motion.h2
              className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-center mb-12"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Frequently asked questions
            </motion.h2>

            <div className="space-y-3">
              {FAQ_ITEMS.map((faq, i) => (
                <motion.div
                  key={i}
                  className="rounded-xl border border-white/[0.06] bg-[#0a0a0f] overflow-hidden"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-[14px] font-medium text-white/80">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-white/30 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openFaq === i && (
                    <motion.div
                      className="px-5 pb-4"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="text-[13px] text-white/40 leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="relative py-24 sm:py-32 border-t border-white/[0.04]">
          <GradientMesh className="opacity-30" />
          <div className="relative z-10 text-center px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] mb-4">
              Ready to understand your codebase?
            </h2>
            <p className="text-white/30 text-[15px] mb-8 max-w-md mx-auto">
              Start with the free tier — no credit card required.
            </p>
            <Link
              href={isAuthenticated ? '/dashboard' : '/auth/signin'}
              className="group inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-8 py-3.5 rounded-full hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] active:scale-[0.96] transition-all duration-500"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-white/[0.04] py-8">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 flex items-center justify-between">
            <span className="text-[12px] text-white/15">© 2026 DocuVerse</span>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-white/15" />
              <span className="text-[12px] text-white/15">Payments secured by Razorpay</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}


/* ═══ Pricing Card ═══ */
function PricingCard({
  name,
  price,
  symbol,
  period,
  description,
  icon,
  accentColor,
  features,
  isCurrent,
  isPopular,
  isLoading,
  onSelect,
  ctaText,
  disabled,
}: {
  name: string
  price: string
  symbol: string
  period: string
  description: string
  icon: React.ReactNode
  accentColor: string
  features: string[]
  isCurrent?: boolean
  isPopular?: boolean
  isLoading?: boolean
  onSelect: () => void
  ctaText: string
  disabled?: boolean
}) {
  return (
    <div
      className={`relative rounded-2xl border p-6 sm:p-8 flex flex-col transition-all duration-300 ${
        isPopular
          ? 'border-purple-500/30 bg-[#0a0a0f] shadow-[0_0_40px_rgba(168,85,247,0.08)]'
          : 'border-white/[0.06] bg-[#0a0a0f]'
      }`}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase bg-purple-500 text-white px-4 py-1 rounded-full">
            <Star className="w-3 h-3" fill="currentColor" />
            Most Popular
          </span>
        </div>
      )}

      {/* Icon + Name */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            color: accentColor,
            backgroundColor: `${accentColor}12`,
            border: `1px solid ${accentColor}20`,
          }}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-white/90">{name}</h3>
          {isCurrent && (
            <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400">Current Plan</span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="mb-2">
        {price === '0' ? (
          <span className="text-[36px] font-bold tracking-[-0.03em] text-white/90">Free</span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-[16px] text-white/50">{symbol}</span>
            <span className="text-[36px] font-bold tracking-[-0.03em] text-white/90">{price}</span>
            <span className="text-[14px] text-white/30">{period}</span>
          </div>
        )}
      </div>

      <p className="text-[13px] text-white/30 mb-6">{description}</p>

      {/* CTA */}
      <button
        onClick={onSelect}
        disabled={disabled || isLoading}
        className={`w-full py-3 rounded-xl text-[14px] font-semibold transition-all duration-300 mb-6 ${
          disabled
            ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
            : isPopular
            ? 'bg-white text-black hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.97]'
            : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.1] active:scale-[0.97]'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        ) : (
          ctaText
        )}
      </button>

      {/* Features */}
      <ul className="space-y-2.5 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] text-white/50">
            <Check className="w-4 h-4 text-emerald-400/70 mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}


/* ═══ Comparison Cell ═══ */
function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex justify-center">
        {value ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <X className="w-4 h-4 text-white/15" />
        )}
      </div>
    )
  }
  return (
    <div className="text-[13px] text-white/50 text-center">{value}</div>
  )
}
