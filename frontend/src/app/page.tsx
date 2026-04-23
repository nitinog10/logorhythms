'use client'

import { motion, useScroll, useTransform, useInView, useMotionValueEvent } from 'framer-motion'
import {
  Play,
  ArrowRight,
  GitBranch,
  Volume2,
  FileCode,
  Layers,
  Zap,
  Sparkles,
  Shield,
  Mic,
  BarChart3,
  Terminal,
  Braces,
  Globe,
  Github,
  ArrowUpRight,
  Code2,
  Headphones,
  Workflow,
  BookOpen,
  Share2,
  Languages,
  LucideMove,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useCallback, useState, useEffect } from 'react'
import { useUserStore } from '@/lib/store'
import GradientMesh from '@/components/landing/GradientMesh'
import RevealText from '@/components/landing/RevealText'
import TiltCard from '@/components/landing/TiltCard'

/* ═══ Easing ═══ */
const ease = [0.23, 1, 0.32, 1] as const

/* ═══ Counter hook ═══ */
function useCounter(target: number, duration = 2000) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref as any, { once: true, margin: '-100px' })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const increment = target / (duration / 16)
    const timer = setInterval(() => {
      start += increment
      if (start >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [isInView, target, duration])

  return { ref, count }
}

/* ═══════════════════════════════════════
   HOME PAGE
   ═══════════════════════════════════════ */
export default function HomePage() {
  const { isAuthenticated } = useUserStore()
  const router = useRouter()

  const handleAuthClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      router.push(token ? '/dashboard' : '/auth/signin')
    },
    [router]
  )

  const authTarget = isAuthenticated ? '/dashboard' : '/auth/signin'

  /* Scroll-linked progress for process timeline */
  const timelineRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: timelineProgress } = useScroll({
    target: timelineRef,
    offset: ['start end', 'end center'],
  })

  /* Header background on scroll */
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden selection:bg-indigo-500/30">
      {/* ─── HEADER ─── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${headerScrolled
            ? 'bg-[#050505]/80 backdrop-blur-2xl border-b border-white/[0.06]'
            : 'bg-transparent'
          }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="DocuVerse" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-[15px] font-semibold tracking-tight text-white/80 group-hover:text-white transition-colors">
              DocuVerse
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {['Process', 'Features', 'Capabilities'].map((item) => (
              <button
                key={item}
                className="text-[13px] tracking-wide uppercase text-white/30 hover:text-white transition-colors duration-300"
                onClick={() => {
                  const id = item.toLowerCase()
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                {item}
              </button>
            ))}
            <Link
              href="/mcp-guide"
              className="text-[13px] tracking-wide uppercase text-white/30 hover:text-white transition-colors duration-300 flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              IDE
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href={authTarget}
              onClick={handleAuthClick}
              className="text-[13px] text-white/40 hover:text-white transition-colors hidden sm:block"
            >
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </Link>
            <Link
              href={authTarget}
              onClick={handleAuthClick}
              className="text-[13px] font-semibold bg-white text-black px-5 py-2 rounded-full hover:bg-white/90 active:scale-[0.96] transition-all duration-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-16">
        <GradientMesh />

        <div className="relative z-10 max-w-[1400px] mx-auto px-6 sm:px-10 w-full">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">
            {/* Left — Text */}
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.1 }}
              >
                <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-indigo-400/80 mb-8 font-medium">
                  <span className="w-8 h-[1px] bg-indigo-500/50" />
                  AI-Powered Code Walkthroughs
                </span>
              </motion.div>

              <RevealText
                as="h1"
                className="text-[clamp(2.8rem,7vw,5.5rem)] font-bold tracking-[-0.04em] leading-[0.92] mb-8"
                delay={0.2}
              >
                Understand any codebase in minutes
              </RevealText>

              <motion.p
                className="text-lg sm:text-xl text-white/35 leading-relaxed max-w-lg mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.8 }}
              >
                Connect a GitHub repo. An AI senior engineer narrates every file
                with synced audio, interactive diagrams, and a live sandbox.
              </motion.p>

              <motion.div
                className="flex flex-wrap gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 1 }}
              >
                <Link
                  href={authTarget}
                  onClick={handleAuthClick}
                  className="group flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-7 py-3.5 rounded-full hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] active:scale-[0.96] transition-all duration-500"
                >
                  Start for free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </Link>
                <Link
                  href="/demo"
                  className="group flex items-center gap-2 text-[15px] font-medium text-white/50 hover:text-white px-6 py-3.5 rounded-full border border-white/[0.1] hover:border-white/[0.25] hover:bg-white/[0.04] transition-all duration-300"
                >
                  <Sparkles className="w-4 h-4" />
                  Explore Demo
                </Link>
              </motion.div>
            </div>

            {/* Right — Code Mockup */}
            <motion.div
              className="relative lg:justify-self-end w-full max-w-[560px]"
              initial={{ opacity: 0, y: 40, rotateY: -5 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ duration: 1.2, ease, delay: 0.5 }}
              style={{ perspective: 1200 }}
            >
              <div className="relative rounded-2xl overflow-hidden bg-[#0a0a0f] border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                {/* Chrome */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 bg-white/[0.02] border-b border-white/[0.06]">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57]/70" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e]/70" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840]/70" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <span className="text-[11px] text-white/20 font-mono flex items-center gap-1.5">
                      <FileCode className="w-3 h-3" />
                      auth_service.py
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                    <Headphones className="w-3 h-3" />
                    NARRATING
                  </div>
                </div>

                {/* Code */}
                <div className="font-mono text-[12.5px] leading-[2] p-5 sm:p-6">
                  <CodeBlock />
                </div>

                {/* Audio bar */}
                <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border-t border-white/[0.06]">
                  <button className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                    <Play className="w-3 h-3 text-white ml-[1px]" fill="white" />
                  </button>
                  {/* Waveform */}
                  <div className="flex-1 flex items-center gap-[2px] h-5">
                    {Array.from({ length: 50 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="flex-1 rounded-full bg-indigo-500/50"
                        style={{ minWidth: 2 }}
                        initial={{ height: '30%' }}
                        animate={{ height: `${20 + Math.random() * 80}%` }}
                        transition={{
                          duration: 0.5 + Math.random() * 0.5,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          delay: i * 0.02,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-white/20 font-mono tabular-nums shrink-0">
                    1:24
                  </span>
                </div>
              </div>

              {/* Card shadow glow */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-[60px] bg-indigo-500/[0.06] rounded-full blur-[40px]" />
            </motion.div>
          </div>
        </div>

        {/* Scroll cue */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 1 }}
        >
          <motion.div
            className="w-5 h-8 rounded-full border border-white/15 flex items-start justify-center p-1"
          >
            <motion.div
              className="w-1 h-1.5 rounded-full bg-white/40"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── MARQUEE ─── */}
      <div className="relative py-10 border-y border-white/[0.04] overflow-hidden bg-[#050505]">
        <div className="marquee-track flex gap-12 items-center whitespace-nowrap">
          {[...Array(2)].map((_, outer) => (
            <div key={outer} className="flex gap-12 items-center shrink-0 marquee-content">
              {[
                'Python', 'TypeScript', 'React', 'Go', 'Rust', 'Java',
                'Next.js', 'Node.js', 'Ruby', 'Kotlin', 'Swift', 'C++',
              ].map((lang) => (
                <span key={`${outer}-${lang}`} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
                  <span className="text-[14px] font-mono tracking-wide text-white/20 uppercase">
                    {lang}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── PROCESS (How It Works) ─── */}
      <section id="process" className="relative py-32 sm:py-40" ref={timelineRef}>
        <div className="max-w-[1100px] mx-auto px-6 sm:px-10">
          <div className="mb-20 sm:mb-28">
            <motion.span
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-indigo-400/70 mb-5 font-medium"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <span className="w-8 h-[1px] bg-indigo-500/50" />
              Process
            </motion.span>
            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.8rem)] font-bold tracking-[-0.03em] leading-[1.05]"
            >
              Three steps from repo to understanding
            </RevealText>
          </div>

          <div className="relative">
            {/* Animated timeline line — sits behind icon boxes via negative z */}
            <div className="absolute left-[28px] sm:left-[36px] top-0 bottom-0 w-[2px] bg-white/[0.04] hidden md:block" style={{ zIndex: 0 }}>
              <motion.div
                className="absolute top-0 left-0 w-full bg-gradient-to-b from-indigo-500 to-purple-500 origin-top"
                style={{ scaleY: timelineProgress, height: '100%' }}
              />
            </div>

            <div className="space-y-20 sm:space-y-28">
              {[
                {
                  num: '01',
                  icon: <GitBranch className="w-5 h-5" />,
                  title: 'Drop in any GitHub repo',
                  desc: 'Just Connect your Repository. DocuVerse clones the repo, analyse every file, and maps out every function, class, and dependency in seconds. Zero config, zero setup.',
                  accent: '#6366f1',
                },
                {
                  num: '02',
                  icon: <Sparkles className="w-5 h-5" />,
                  title: 'AI builds your walkthrough',
                  desc: 'Our Ai reads your code like a senior engineer and writes a clear, file by file narration. Text-to-speech generates perfectly synced audio. Architecture diagrams and flow charts appear automatically.',
                  accent: '#a855f7',
                },
                {
                  num: '03',
                  icon: <Play className="w-5 h-5" />,
                  title: 'Explore, listen, and experiment',
                  desc: 'Hit play and watch the code scroll in sync with AI narration. Tap into interactive architecture diagrams, trace dependencies visually, and spin up a live sandbox to test any snippet all without leaving the page.',
                  accent: '#22d3ee',
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  className="flex gap-6 sm:gap-10 items-start"
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.8, ease, delay: i * 0.1 }}
                >
                  {/* Number + Icon — z-10 so it sits above the timeline line */}
                  <div className="relative shrink-0 flex flex-col items-center gap-3" style={{ zIndex: 10 }}>
                    <div
                      className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-2xl flex items-center justify-center border border-white/[0.06] bg-[#050505]"
                      style={{ color: step.accent }}
                    >
                      {step.icon}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pt-1">
                    <span
                      className="text-[12px] font-mono tracking-wider mb-3 block"
                      style={{ color: step.accent, opacity: 0.7 }}
                    >
                      STEP {step.num}
                    </span>
                    <h3 className="text-[clamp(1.3rem,3vw,2rem)] font-bold tracking-[-0.02em] mb-3 text-white/90">
                      {step.title}
                    </h3>
                    <p className="text-[15px] sm:text-base text-white/30 leading-relaxed max-w-lg">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="relative py-32 sm:py-40">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
          <div className="mb-14 sm:mb-20">
            <motion.span
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase text-purple-400/70 mb-5 font-medium"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <span className="w-8 h-[1px] bg-purple-500/50" />
              Features
            </motion.span>
            <RevealText
              as="h2"
              className="text-[clamp(2rem,5vw,3.8rem)] font-bold tracking-[-0.03em] leading-[1.05] max-w-xl"
            >
              Powerful features, built for deep understanding
            </RevealText>
          </div>

          {/* Horizontal scroll carousel — pt-4 pb-8 gives room so tilt scale isn't clipped */}
          <div className="relative -mx-6 sm:-mx-10 px-6 sm:px-10">
            <div className="flex gap-5 overflow-x-auto pt-4 pb-8 snap-x snap-mandatory scrollbar-hide items-stretch">
              {[
                {
                  icon: <Mic className="w-7 h-7" />,
                  title: 'AI Voice Narration',
                  desc: 'An AI senior engineer narrates your code with perfectly synced audio. Line-by-line highlighting follows along as you listen.',
                  accent: '#6366f1',
                  tag: 'Core',
                },
                {
                  icon: <Layers className="w-7 h-7" />,
                  title: 'Architecture Diagrams',
                  desc: 'Auto-generated Mermaid flow charts and architecture diagrams for every file and module relationship.',
                  accent: '#a855f7',
                  tag: 'Visual',
                },
                {
                  icon: <Terminal className="w-7 h-7" />,
                  title: 'Live Sandbox',
                  desc: 'Run and test code snippets instantly, right inside the walkthrough. No setup needed.',
                  accent: '#f59e0b',
                  tag: 'Interactive',
                },
                {
                  icon: <Braces className="w-7 h-7" />,
                  title: 'Tree-sitter AST',
                  desc: 'Accurate function, class, and scope extraction across Python, JS, TS, Java, Go, and Rust using tree-sitter parsing.',
                  accent: '#22d3ee',
                  tag: 'Engine',
                },
                {
                  icon: <Shield className="w-7 h-7" />,
                  title: 'Private Repos',
                  desc: 'Securely connect private GitHub repositories. Your code never leaves your session.',
                  accent: '#10b981',
                  tag: 'Security',
                },
                {
                  icon: <BarChart3 className="w-7 h-7" />,
                  title: 'Impact Analysis',
                  desc: 'Understand which functions depend on what. See the blast radius of any change before you make it.',
                  accent: '#f97316',
                  tag: 'Analysis',
                },

              ].map((feat, i) => (
                <motion.div
                  key={feat.title}
                  className="snap-start shrink-0 flex"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.7, ease, delay: i * 0.08 }}
                >
                  <TiltCard className="rounded-2xl w-[320px] sm:w-[360px]">
                    <div className="relative rounded-2xl bg-[#0a0a0f] border border-white/[0.06] p-7 sm:p-8 h-full flex flex-col" style={{ minHeight: '280px' }}>
                      {/* Tag */}
                      <span
                        className="text-[10px] font-mono font-bold tracking-wider uppercase self-start px-2.5 py-1 rounded mb-6"
                        style={{
                          color: feat.accent,
                          backgroundColor: `${feat.accent}12`,
                        }}
                      >
                        {feat.tag}
                      </span>

                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                        style={{
                          color: feat.accent,
                          backgroundColor: `${feat.accent}0d`,
                          border: `1px solid ${feat.accent}18`,
                        }}
                      >
                        {feat.icon}
                      </div>

                      <h3 className="text-xl font-bold tracking-tight mb-3 text-white/90">
                        {feat.title}
                      </h3>
                      <p className="text-[14px] text-white/30 leading-relaxed">
                        {feat.desc}
                      </p>
                    </div>
                  </TiltCard>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CAPABILITIES (STATS) ─── */}
      <section id="capabilities" className="relative py-24 sm:py-32 border-y border-white/[0.04]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
            {[
              { num: 5000, suffix: '+', label: 'Files analyzed', icon: <Code2 className="w-5 h-5" /> },
              { num: 120, suffix: '+', label: 'Repos connected', icon: <Github className="w-5 h-5" /> },
              { num: 12, suffix: '', label: 'Languages', icon: <Globe className="w-5 h-5" /> },
              { num: 60, suffix: 's', label: 'Avg. walkthrough', icon: <Zap className="w-5 h-5" /> },
            ].map((stat) => {
              const { ref, count } = useCounter(stat.num)
              return (
                <motion.div
                  key={stat.label}
                  className="text-center lg:text-left"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, ease }}
                >
                  <div className="flex items-center justify-center lg:justify-start gap-2 mb-3 text-indigo-400/60">
                    {stat.icon}
                  </div>
                  <span
                    ref={ref}
                    className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.03em] bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60"
                  >
                    {count.toLocaleString()}
                    {stat.suffix}
                  </span>
                  <p className="text-[13px] text-white/25 mt-1 tracking-wide uppercase">
                    {stat.label}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative py-40 sm:py-52 overflow-hidden">
        <GradientMesh className="opacity-50" />

        <motion.div
          className="relative z-10 max-w-2xl mx-auto text-center px-6"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease }}
        >
          <RevealText
            as="h2"
            className="text-[clamp(2.2rem,6vw,4.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-6"
          >
            Start building understanding
          </RevealText>
          <p className="text-base sm:text-lg text-white/30 mb-12 leading-relaxed max-w-md mx-auto">
            Connect a repo. Get your first walkthrough in under 60 seconds. No credit card required.
          </p>
          <Link
            href="/auth/signin"
            className="group inline-flex items-center gap-2.5 bg-white text-black font-semibold text-[15px] px-8 py-4 rounded-full hover:shadow-[0_0_40px_rgba(99,102,241,0.4)] active:scale-[0.96] transition-all duration-500"
          >
            Get Started Free
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
          </Link>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.04] py-12 sm:py-16">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="DocuVerse" className="w-6 h-6 rounded-md object-cover" />
                <span className="text-[14px] font-semibold text-white/60">DocuVerse</span>
              </Link>
              <p className="text-[13px] text-white/20 max-w-xs">
                Transform complex codebases into interactive,    audio & visual walkthroughs.
              </p>
            </div>

            <div className="flex gap-10">
              <div className="space-y-3">
                <span className="text-[11px] tracking-[0.15em] uppercase text-white/20 font-medium">Product</span>
                <div className="space-y-2">
                  <Link href="/demo" className="block text-[13px] text-white/30 hover:text-white/60 transition-colors">Demo</Link>
                  <Link href="/mcp-guide" className="block text-[13px] text-white/30 hover:text-white/60 transition-colors">IDE Plugin</Link>
                </div>
              </div>
              <div className="space-y-3">
                <span className="text-[11px] tracking-[0.15em] uppercase text-white/20 font-medium">Company</span>
                <div className="space-y-2">
                  <Link href="/auth/signin" className="block text-[13px] text-white/30 hover:text-white/60 transition-colors">Sign in</Link>
                  <span className="block text-[13px] text-white/30">Team BitMask</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[12px] text-white/15">© 2026 DocuVerse</span>
            <span className="flex items-center gap-1.5 text-[12px] text-white/15">
              Built with love by Logorhythms AI
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════
   Code Block Component
   ═══════════════════════════════════════ */
function CodeBlock() {
  const lines = [
    { n: 1, hl: false, tokens: [{ t: 'class', c: '#c084fc' }, { t: ' AuthService', c: '#67e8f9' }, { t: ':', c: '#a5b4fc' }] },
    { n: 2, hl: false, tokens: [{ t: '    ', c: '' }, { t: '"""Handle JWT authentication."""', c: '#4ade80' }] },
    { n: 3, hl: false, tokens: [] },
    { n: 4, hl: true, tokens: [{ t: '    ', c: '' }, { t: 'async', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'def', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'verify_token', c: '#818cf8' }, { t: '(self, token):', c: '#94a3b8' }] },
    { n: 5, hl: true, tokens: [{ t: '        payload = jwt.', c: '#94a3b8' }, { t: 'decode', c: '#818cf8' }, { t: '(token)', c: '#94a3b8' }] },
    { n: 6, hl: true, tokens: [{ t: '        user_id = payload.', c: '#94a3b8' }, { t: 'get', c: '#818cf8' }, { t: '(', c: '#94a3b8' }, { t: '"sub"', c: '#4ade80' }, { t: ')', c: '#94a3b8' }] },
    { n: 7, hl: false, tokens: [{ t: '        ', c: '' }, { t: 'if', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'not', c: '#c084fc' }, { t: ' user_id:', c: '#94a3b8' }] },
    { n: 8, hl: false, tokens: [{ t: '            ', c: '' }, { t: 'raise', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'InvalidCredentials', c: '#67e8f9' }, { t: '()', c: '#94a3b8' }] },
    { n: 9, hl: false, tokens: [{ t: '        ', c: '' }, { t: 'return', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'await', c: '#c084fc' }, { t: ' self.repo.', c: '#94a3b8' }, { t: 'get', c: '#818cf8' }, { t: '(id)', c: '#94a3b8' }] },
  ]

  return (
    <div className="space-y-[1px]">
      {lines.map((l, i) => (
        <motion.div
          key={l.n}
          className={`flex items-center rounded-md px-2 -mx-2 ${l.hl
              ? 'bg-indigo-500/[0.06] border-l-2 border-indigo-500'
              : 'border-l-2 border-transparent'
            }`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1 + i * 0.07, duration: 0.4, ease }}
        >
          <span className="w-7 text-right text-[11px] text-white/10 select-none pr-3 shrink-0 font-mono">
            {l.n}
          </span>
          <span className="flex-1 whitespace-pre">
            {l.tokens.map((tok, ti) => (
              <span key={ti} style={{ color: tok.c || '#94a3b8' }}>
                {tok.t}
              </span>
            ))}
          </span>
        </motion.div>
      ))}
    </div>
  )
}
