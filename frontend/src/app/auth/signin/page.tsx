'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Code2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/api'
import toast from 'react-hot-toast'

const ease = [0.25, 0.1, 0.25, 1] as const

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await auth.getGitHubAuthUrl()
      if (data.auth_url) {
        window.location.href = data.auth_url
      } else {
        throw new Error('No auth URL returned')
      }
    } catch (err) {
      console.error('Error initiating GitHub OAuth:', err)
      const msg = err instanceof Error ? err.message : 'Failed to connect to server'
      setError(msg)
      toast.error(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dv-bg flex items-center justify-center text-dv-text selection:bg-dv-accent/30">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-25%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-dv-accent/[0.07] to-transparent rounded-full blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[25%] w-[500px] h-[500px] bg-dv-purple/[0.04] rounded-full blur-[120px]" />
        <div className="absolute top-[50%] left-[10%] w-[350px] h-[350px] bg-dv-indigo/[0.03] rounded-full blur-[100px]" />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-[380px] mx-auto px-6 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
      >
        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-dv-accent to-dv-indigo flex items-center justify-center shadow-[0_0_24px_rgba(10,132,255,0.3)]">
            <Code2 className="w-5 h-5 text-dv-text" />
          </div>
        </Link>

        {/* Heading */}
        <h1 className="text-[28px] font-bold tracking-[-0.03em] leading-tight mb-2">
          Sign in to{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-accent to-dv-purple">
            DocuVerse
          </span>
        </h1>
        <p className="text-[15px] text-dv-text/35 mb-10">
          AI-powered code walkthroughs, narrated for you.
        </p>

        {/* Glass card */}
        <motion.div
          className="rounded-2xl bg-[var(--glass-4)] backdrop-blur-2xl border border-dv-border p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.5)]"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease }}
        >
          {/* GitHub button */}
          <button
            onClick={handleGitHubSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-[14px]
                     bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[15px]
                     hover:bg-[var(--btn-solid-hover)] active:scale-[0.97] transition-all
                     disabled:opacity-40 disabled:pointer-events-none
                     shadow-[0_2px_16px_rgba(255,255,255,0.1)]"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            )}
            {isLoading ? 'Connecting...' : 'Continue with GitHub'}
          </button>

          {error && (
            <p className="mt-3 text-[12px] text-dv-error">{error}</p>
          )}
        </motion.div>

        {/* Footer */}
        <p className="text-[11px] text-dv-text/15 mt-8 leading-relaxed">
          By continuing you agree to our{' '}
          <Link href="/terms" className="text-dv-text/25 hover:text-dv-text/50 transition-colors">Terms</Link> &{' '}
          <Link href="/privacy" className="text-dv-text/25 hover:text-dv-text/50 transition-colors">Privacy</Link>
        </p>
      </motion.div>
    </div>
  )
}

