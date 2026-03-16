'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
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
  ChevronRight,
  Globe,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useCallback } from 'react'
import { useUserStore } from '@/lib/store'

/* ── Apple-style easing ── */
const appleEase = [0.25, 0.1, 0.25, 1] as const
const appleSlow = [0.42, 0, 0.58, 1] as const

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const riseUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: appleEase } },
}
const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: appleEase } },
}

export default function HomePage() {
  const { isAuthenticated } = useUserStore()
  const authTarget = isAuthenticated ? '/dashboard' : '/auth/signin'
  const router = useRouter()
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.96])

  // Check auth at click time to avoid hydration timing issues
  const handleAuthClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    router.push(token ? '/dashboard' : '/auth/signin')
  }, [router])

  return (
    <div className="min-h-screen bg-dv-bg overflow-x-hidden text-dv-text selection:bg-dv-accent/30">
      {/* ────────────── NAVIGATION ────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[var(--bar-bg)] backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-dv-border">
        <div className="flex items-center justify-between max-w-[980px] mx-auto px-6 h-12">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="DocuVerse" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-dv-text/90 group-hover:text-dv-text transition-colors">
              DocuVerse
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {['Features', 'How it works', 'Capabilities'].map((item) => (
              <button
                key={item}
                className="text-[13px] text-dv-text/50 hover:text-dv-text/90 transition-colors duration-200"
                onClick={() => {
                  const id = item.toLowerCase().replace(/\s/g, '-')
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                {item}
              </button>
            ))}
            <Link
              href="/mcp-guide"
              className="text-[13px] text-dv-text/50 hover:text-dv-text/90 transition-colors duration-200 flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              Use in IDE
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={authTarget}
              onClick={handleAuthClick}
              className="text-[13px] text-dv-text/50 hover:text-dv-text/90 transition-colors hidden sm:block"
            >
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </Link>
            <Link
              href={authTarget}
              onClick={handleAuthClick}
              className="text-[13px] font-medium bg-[var(--glass-12)] backdrop-blur-xl border border-dv-border text-dv-text px-4 py-1.5 rounded-full hover:bg-[var(--glass-16)] hover:border-dv-border active:scale-[0.97] transition-all shadow-[var(--btn-solid-shadow)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ────────────── HERO ────────────── */}
      <div ref={heroRef}>
        <motion.section
          className="relative pt-28 pb-16 overflow-hidden"
          style={{ opacity: heroOpacity, scale: heroScale }}
        >
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[1100px] h-[600px] bg-gradient-to-b from-dv-accent/[0.08] to-transparent rounded-full blur-[120px]" />
            <div className="absolute top-[-10%] left-[20%] w-[400px] h-[400px] bg-dv-purple/[0.04] rounded-full blur-[100px]" />
            <div className="absolute top-[10%] right-[15%] w-[300px] h-[300px] bg-dv-indigo/[0.04] rounded-full blur-[80px]" />
          </div>

          <div className="relative z-10 max-w-[1080px] mx-auto px-6 flex flex-col-reverse lg:flex-row items-center gap-10 lg:gap-12">
            
            {/* LEFT — Code Preview Device */}
            <motion.div
              className="w-full lg:w-[50%] flex-shrink-0"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.9, ease: appleEase }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-dv-border bg-[var(--glass-4)] backdrop-blur-2xl shadow-[var(--card-shadow)]">
                {/* Window chrome */}
                <div className="flex items-center gap-2.5 px-5 py-3 bg-[var(--glass-3)] backdrop-blur-xl border-b border-dv-border">
                  <div className="flex gap-[7px]">
                    <div className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                    <div className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                    <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--glass-4)] text-[12px] text-dv-text/30">
                      <FileCode className="w-3 h-3" />
                      auth_service.py
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-dv-accent bg-dv-accent/10 px-2.5 py-1 rounded-full">
                    <Volume2 className="w-3 h-3" />
                    LIVE
                  </div>
                </div>

                {/* Code content */}
                <div className="font-mono text-[13px] leading-[1.8] p-6 bg-[var(--code-bg)] backdrop-blur-sm">
                  <CodePreview />
                </div>

                {/* Player transport */}
                <div className="flex items-center gap-4 px-5 py-3.5 bg-[var(--glass-3)] backdrop-blur-xl border-t border-dv-border">
                  <button className="w-8 h-8 rounded-full bg-dv-accent flex items-center justify-center hover:brightness-110 transition-all">
                    <Play className="w-3.5 h-3.5 text-dv-text ml-[1px]" />
                  </button>
                  <div className="flex-1 relative h-[3px] bg-[var(--glass-8)] rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-dv-accent rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: '42%' }}
                      transition={{ duration: 3, delay: 1.2, ease: appleSlow }}
                    />
                  </div>
                  <span className="text-[11px] text-dv-text/25 font-mono tabular-nums tracking-wide">
                    1:24 / 3:18
                  </span>
                </div>
              </div>

              {/* Reflection glow under card */}
              <div className="mt-4 mx-auto w-[70%] h-[60px] bg-dv-accent/[0.04] rounded-full blur-[40px] pointer-events-none" />
            </motion.div>

            {/* RIGHT — Hero Text */}
            <motion.div
              className="w-full lg:w-[50%] text-center lg:text-left"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {/* Pill badge */}
              <motion.div variants={riseUp}>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--glass-6)] backdrop-blur-xl border border-dv-border text-[13px] text-dv-text/60 mb-6 shadow-[var(--inset)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-dv-success animate-pulse" />
                  Powered by team BitMask
                </span>
              </motion.div>

              {/* Hero title */}
              <motion.h1
                variants={riseUp}
                className="text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-6"
              >
                <span className="text-dv-text">Code that</span>
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-accent via-dv-purple to-[#ff375f]">
                  speaks for itself
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                variants={riseUp}
                className="text-[clamp(1rem,2vw,1.2rem)] leading-relaxed text-dv-text/50 max-w-lg mx-auto lg:mx-0 mb-10 font-normal tracking-[-0.01em]"
              >
                Connect a GitHub repository. An AI senior engineer narrates every file
                with synced audio, interactive diagrams, and a live sandbox.
              </motion.p>

              {/* CTA buttons */}
              <motion.div variants={riseUp} className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4">
                <Link
                  href={authTarget}
                  onClick={handleAuthClick}
                  className="group flex items-center gap-2.5 bg-[var(--glass-10)] backdrop-blur-2xl border border-dv-border text-dv-text font-semibold text-[15px] px-8 py-3.5 rounded-full hover:bg-[var(--glass-16)] hover:border-dv-border hover:shadow-[var(--card-shadow)] active:scale-[0.97] transition-all shadow-[var(--card-shadow)]"
                >
                  <Play className="w-4 h-4" />
                  Start for free
                  <ArrowRight className="w-4 h-4 -ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/demo"
                  className="flex items-center gap-2 text-[15px] font-medium text-dv-text/60 hover:text-dv-text px-6 py-3.5 rounded-full bg-[var(--glass-4)] backdrop-blur-xl border border-dv-border hover:bg-[var(--glass-8)] hover:border-dv-border transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Explore Demo
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </motion.div>

          </div>
        </motion.section>
      </div>

      {/* ────────────── HOW IT WORKS ────────────── */}
      <section id="how-it-works" className="relative py-28">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--section-band)' }} />
        <div className="relative z-10 max-w-[980px] mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: appleEase }}
          >
            <p className="text-[13px] font-semibold text-dv-accent tracking-wide uppercase mb-3">
              How it works
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.03em] leading-tight">
              Three steps to understanding
            </h2>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-3 gap-5"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {[
              {
                icon: <GitBranch className="w-6 h-6" />,
                step: '01',
                title: 'Connect',
                desc: 'Link your GitHub repo. We parse every file with tree-sitter AST analysis in seconds.',
                color: '#0a84ff',
              },
              {
                icon: <Sparkles className="w-6 h-6" />,
                step: '02',
                title: 'Generate',
                desc: 'GPT-4o writes narration scripts. AI voice syncs perfectly to each code section.',
                color: '#bf5af2',
              },
              {
                icon: <Play className="w-6 h-6" />,
                step: '03',
                title: 'Play',
                desc: 'Auto-scrolling code, voice narration, Mermaid diagrams, and a live sandbox.',
                color: '#30d158',
              },
            ].map((f) => (
              <motion.div
                key={f.step}
                variants={riseUp}
                className="group relative p-8 rounded-2xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border hover:border-dv-border hover:bg-[var(--glass-6)] transition-all duration-500 shadow-[var(--inset)]"
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background: `radial-gradient(300px circle at 50% 0%, ${f.color}08, transparent 70%)`,
                  }}
                />
                <div className="relative">
                  <div className="flex items-center justify-between mb-8">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: `${f.color}12`, color: f.color }}
                    >
                      {f.icon}
                    </div>
                    <span className="text-[13px] font-mono text-dv-text/15">{f.step}</span>
                  </div>
                  <h3 className="text-[22px] font-bold tracking-[-0.02em] mb-2">{f.title}</h3>
                  <p className="text-[15px] text-dv-text/40 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ────────────── FEATURES BENTO GRID ────────────── */}
      <section id="features" className="relative py-28">
        <div className="max-w-[980px] mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: appleEase }}
          >
            <p className="text-[13px] font-semibold text-dv-purple tracking-wide uppercase mb-3">
              Features
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.03em] leading-tight">
              Everything you need, nothing you don&apos;t
            </h2>
          </motion.div>

          {/* Bento Grid */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {/* Large — Voice Narration */}
            <motion.div
              variants={scaleIn}
              className="col-span-2 row-span-2 group relative p-8 rounded-3xl bg-gradient-to-br from-[var(--glass-6)] to-[var(--glass-2)] backdrop-blur-2xl border border-dv-border hover:border-dv-border hover:bg-gradient-to-br hover:from-[var(--glass-8)] hover:to-[var(--glass-3)] transition-all duration-500 overflow-hidden shadow-[var(--inset)]"
            >
              <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-dv-accent/[0.06] rounded-full blur-[80px] pointer-events-none" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-dv-accent/10 flex items-center justify-center mb-6 text-dv-accent">
                  <Mic className="w-7 h-7" />
                </div>
                <h3 className="text-[26px] font-bold tracking-[-0.02em] mb-3">AI Voice Narration</h3>
                <p className="text-[15px] text-dv-text/40 leading-relaxed max-w-sm">
                  An AI senior engineer narrates your code with perfectly synced audio playback and line-by-line highlighting.
                </p>
                {/* Mini waveform */}
                <div className="flex items-end gap-[3px] mt-8 h-10">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] rounded-full bg-dv-accent/40"
                      initial={{ height: '20%' }}
                      animate={{ height: `${20 + Math.random() * 80}%` }}
                      transition={{
                        duration: 0.6 + Math.random() * 0.8,
                        repeat: Infinity,
                        repeatType: 'reverse',
                        delay: i * 0.04,
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Small — Diagrams */}
            <motion.div
              variants={scaleIn}
              className="col-span-1 group relative p-6 rounded-3xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border hover:border-dv-border hover:bg-[var(--glass-6)] transition-all duration-500 shadow-[var(--inset)]"
            >
              <div className="w-10 h-10 rounded-xl bg-dv-purple/10 backdrop-blur-sm flex items-center justify-center mb-4 text-dv-purple">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold tracking-[-0.01em] mb-1">Diagrams</h3>
              <p className="text-[13px] text-dv-text/35 leading-relaxed">
                Auto-generated Mermaid flow & architecture diagrams
              </p>
            </motion.div>

            {/* Small — Sandbox */}
            <motion.div
              variants={scaleIn}
              className="col-span-1 group relative p-6 rounded-3xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border hover:border-dv-border hover:bg-[var(--glass-6)] transition-all duration-500 shadow-[var(--inset)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#ffd60a]/10 backdrop-blur-sm flex items-center justify-center mb-4 text-[#ffd60a]">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold tracking-[-0.01em] mb-1">Live Sandbox</h3>
              <p className="text-[13px] text-dv-text/35 leading-relaxed">
                Run and test code snippets instantly, right inside the walkthrough
              </p>
            </motion.div>

            {/* Medium — AST Parsing */}
            <motion.div
              variants={scaleIn}
              className="col-span-2 group relative p-6 rounded-3xl bg-[var(--glass-3)] backdrop-blur-2xl border border-dv-border hover:border-dv-border hover:bg-[var(--glass-6)] transition-all duration-500 shadow-[var(--inset)]"
            >
              <div className="flex items-start gap-5">
                <div className="w-10 h-10 rounded-xl bg-dv-success/10 flex items-center justify-center text-dv-success shrink-0">
                  <Braces className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold tracking-[-0.01em] mb-1">Tree-sitter AST</h3>
                  <p className="text-[13px] text-dv-text/35 leading-relaxed">
                    Accurate function, class, and scope extraction across Python, JS, TS, Java, Go, and Rust
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ────────────── CAPABILITIES ────────────── */}
      <section id="capabilities" className="relative py-20">
        <div className="max-w-[980px] mx-auto px-6">
          <motion.div
            className="flex items-center gap-8 justify-center flex-wrap"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            {[
              { icon: <Volume2 className="w-4 h-4" />, label: 'Voice Narration', color: '#0a84ff' },
              { icon: <Layers className="w-4 h-4" />, label: 'Mermaid Diagrams', color: '#bf5af2' },
              { icon: <Zap className="w-4 h-4" />, label: 'Live Sandbox', color: '#ffd60a' },
              { icon: <Shield className="w-4 h-4" />, label: 'Private Repos', color: '#30d158' },
              { icon: <BarChart3 className="w-4 h-4" />, label: 'Impact Analysis', color: '#ff9f0a' },
              { icon: <Globe className="w-4 h-4" />, label: 'Multi-language', color: '#64d2ff' },
            ].map((c) => (
              <motion.div
                key={c.label}
                variants={riseUp}
                className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-dv-border bg-[var(--glass-4)] backdrop-blur-xl hover:bg-[var(--glass-8)] hover:border-dv-border transition-all shadow-[var(--inset)]"
              >
                <span style={{ color: c.color }}>{c.icon}</span>
                <span className="text-[13px] font-medium text-dv-text/50">{c.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ────────────── CTA ────────────── */}
      <section className="relative py-32">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-dv-accent/[0.05] to-transparent rounded-full blur-[100px]" />
        </div>
        <motion.div
          className="relative z-10 max-w-lg mx-auto text-center px-6"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: appleEase }}
        >
          <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.03em] leading-tight mb-4">
            Ready to hear
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-accent to-dv-purple">
              your code?
            </span>
          </h2>
          <p className="text-[15px] text-dv-text/40 mb-10 leading-relaxed">
            Connect a repo. Get your first walkthrough in under 60 seconds.
          </p>
          <Link
            href="/auth/signin"
            className="group inline-flex items-center gap-2 bg-[var(--glass-10)] backdrop-blur-2xl border border-dv-border text-dv-text font-semibold text-[15px] px-8 py-3.5 rounded-full hover:bg-[var(--glass-16)] hover:border-dv-border hover:shadow-[var(--card-shadow)] active:scale-[0.97] transition-all shadow-[var(--card-shadow)]"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>
      </section>

      {/* ────────────── FOOTER ────────────── */}
      <footer className="border-t border-dv-border-subtle py-6">
        <div className="max-w-[980px] mx-auto px-6 flex items-center justify-between">
          <span className="text-[12px] text-dv-text/20">© 2025 DocuVerse</span>
          <span className="flex items-center gap-1.5 text-[12px] text-dv-text/20">
            Built with <Sparkles className="w-3 h-3 text-dv-accent/50" /> DocuSense AI
          </span>
        </div>
      </footer>
    </div>
  )
}

/* ── Code Preview Component ── */
function CodePreview() {
  const lines = [
    { n: 1, code: 'class AuthService:', hl: false, tokens: [{ text: 'class', type: 'kw' }, { text: ' AuthService', type: 'cls' }, { text: ':', type: 'op' }] },
    { n: 2, code: '    """Handle JWT authentication."""', hl: false, tokens: [{ text: '    ', type: '' }, { text: '"""Handle JWT authentication."""', type: 'str' }] },
    { n: 3, code: '', hl: false, tokens: [] },
    { n: 4, code: '    async def verify_token(self, token):', hl: true, tokens: [{ text: '    ', type: '' }, { text: 'async', type: 'kw' }, { text: ' ', type: '' }, { text: 'def', type: 'kw' }, { text: ' ', type: '' }, { text: 'verify_token', type: 'fn' }, { text: '(self, token):', type: '' }] },
    { n: 5, code: '        payload = jwt.decode(token)', hl: true, tokens: [{ text: '        payload = jwt.', type: '' }, { text: 'decode', type: 'fn' }, { text: '(token)', type: '' }] },
    { n: 6, code: '        user_id = payload.get("sub")', hl: true, tokens: [{ text: '        user_id = payload.', type: '' }, { text: 'get', type: 'fn' }, { text: '(', type: '' }, { text: '"sub"', type: 'str' }, { text: ')', type: '' }] },
    { n: 7, code: '        if not user_id:', hl: false, tokens: [{ text: '        ', type: '' }, { text: 'if', type: 'kw' }, { text: ' ', type: '' }, { text: 'not', type: 'kw' }, { text: ' user_id:', type: '' }] },
    { n: 8, code: '            raise InvalidCredentials()', hl: false, tokens: [{ text: '            ', type: '' }, { text: 'raise', type: 'kw' }, { text: ' ', type: '' }, { text: 'InvalidCredentials', type: 'cls' }, { text: '()', type: '' }] },
    { n: 9, code: '        return await self.repo.get(id)', hl: false, tokens: [{ text: '        ', type: '' }, { text: 'return', type: 'kw' }, { text: ' ', type: '' }, { text: 'await', type: 'kw' }, { text: ' self.repo.', type: '' }, { text: 'get', type: 'fn' }, { text: '(id)', type: '' }] },
  ]

  const tokenColor: Record<string, string> = {
    kw: 'var(--code-kw)',
    str: 'var(--code-str)',
    fn: 'var(--code-fn)',
    cls: 'var(--code-cls)',
    op: 'var(--code-op)',
    '': 'var(--code-plain)',
  }

  return (
    <div className="space-y-0.5">
      {lines.map((l, i) => (
        <motion.div
          key={l.n}
          className={`flex items-center rounded-md px-2 -mx-2 transition-colors ${l.hl ? 'bg-dv-accent/[0.06] border-l-2 border-dv-accent' : 'border-l-2 border-transparent'
            }`}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 + i * 0.06, duration: 0.4, ease: appleEase }}
        >
          <span className="w-8 text-right text-[12px] text-dv-text/15 select-none pr-4 shrink-0 font-mono">
            {l.n}
          </span>
          <span className="flex-1 whitespace-pre">
            {l.tokens.map((t, ti) => (
              <span key={ti} style={{ color: tokenColor[t.type] || 'var(--code-plain)' }}>
                {t.text}
              </span>
            ))}
          </span>
        </motion.div>
      ))}
    </div>
  )
}
