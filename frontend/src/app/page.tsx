'use client'

import { motion, useInView, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowUpRight, GitBranch, Sparkles, Play, Terminal, Mic, Layers, Braces, Shield, BarChart3, Zap, Code2, Github, Globe, Headphones, FileCode, Check, ChevronDown, Users, BookOpen, Workflow, MessageSquare, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useCallback, useState, useEffect } from 'react'
import { useUserStore, useUIStore } from '@/lib/store'
import WireframeSphere from '@/components/landing/WireframeSphere'

const ease = [0.23, 1, 0.32, 1] as const

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
      if (start >= target) { setCount(target); clearInterval(timer) }
      else { setCount(Math.floor(start)) }
    }, 16)
    return () => clearInterval(timer)
  }, [isInView, target, duration])
  return { ref, count }
}

export default function HomePage() {
  const { isAuthenticated } = useUserStore()
  const router = useRouter()
  const handleAuthClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    router.push(token ? '/dashboard' : '/auth/signin')
  }, [router])
  const authTarget = isAuthenticated ? '/dashboard' : '/auth/signin'

  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const isDark = theme !== 'light'
  const toggleTheme = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme])

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navItems = ['What\'s Inside', 'How It Works']

  return (
    <div className="min-h-screen bg-[var(--lp-bg)] text-[rgb(var(--lp-text))] overflow-x-hidden selection:bg-indigo-500/30">
      {/* ─── HEADER ─── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${headerScrolled ? 'bg-[var(--lp-bg)]/80 backdrop-blur-2xl border-b border-[var(--lp-border)]' : 'bg-transparent'}`}>
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/logo.png" alt="DocuVerse" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-[17px] font-bold tracking-tight" style={{ color: 'var(--lp-text-heading)' }}>DocuVerse</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button key={item} className="text-[13px] tracking-wide uppercase transition-colors duration-300" style={{ color: 'var(--lp-text-muted)' }}
                onClick={() => { document.getElementById(item.toLowerCase().replace(/['\s]+/g, '-'))?.scrollIntoView({ behavior: 'smooth' }) }}>
                {item}
              </button>
            ))}
            <Link href="/mcp-guide" className="text-[13px] tracking-wide uppercase transition-colors duration-300 flex items-center gap-1.5" style={{ color: 'var(--lp-text-muted)' }}>
              <Terminal className="w-3.5 h-3.5" /> IDE
            </Link>
            <Link href="/pricing" className="text-[13px] tracking-wide uppercase transition-colors duration-300" style={{ color: 'var(--lp-text-muted)' }}>Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative w-9 h-9 rounded-full border border-[var(--lp-card-border)] flex items-center justify-center transition-all duration-300 hover:border-[var(--lp-border-hover)] hover:bg-[var(--lp-surface)]"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun className="w-4 h-4" style={{ color: 'var(--lp-text-label)' }} />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon className="w-4 h-4" style={{ color: 'var(--lp-text-label)' }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
            <Link href={authTarget} onClick={handleAuthClick} className="text-[13px] transition-colors hidden sm:block" style={{ color: 'var(--lp-text-label)' }}>
              {isAuthenticated ? 'Dashboard' : 'Login'}
            </Link>
            <Link href={authTarget} onClick={handleAuthClick}
              className="text-[13px] font-medium transition-colors flex items-center gap-1" style={{ color: 'var(--lp-text-label)' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-16 overflow-hidden">
        {/* Intense geometric light streaks (Monogaze style) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Center intersecting V-shape */}
          <motion.div className="absolute top-[-20%] left-[40%] w-[1.5px] h-[150vh]" style={{ background: `linear-gradient(to bottom, transparent, var(--lp-streak), transparent)`, transform: 'rotate(35deg)', transformOrigin: 'top center' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, ease: 'easeOut' }} />
          <motion.div className="absolute top-[-20%] right-[40%] w-[1.5px] h-[150vh]" style={{ background: `linear-gradient(to bottom, transparent, var(--lp-streak), transparent)`, transform: 'rotate(-35deg)', transformOrigin: 'top center' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, ease: 'easeOut', delay: 0.2 }} />

          {/* Far left diagonal */}
          <motion.div className="absolute top-[-10%] left-[10%] w-[1px] h-[120vh]" style={{ background: `linear-gradient(to bottom, transparent, var(--lp-streak), transparent)`, transform: 'rotate(25deg)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, ease: 'easeOut', delay: 0.4 }} />

          {/* Far right sharp diagonal */}
          <motion.div className="absolute top-[10%] right-[-10%] w-[2px] h-[100vh]" style={{ background: `linear-gradient(to bottom, transparent, var(--lp-streak), transparent)`, transform: 'rotate(-55deg)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, ease: 'easeOut', delay: 0.6 }} />

          {/* Horizontal cross beam */}
          <motion.div className="absolute top-[40%] left-[-10%] w-[1px] h-[120vw]" style={{ background: `linear-gradient(to bottom, transparent, var(--lp-streak), transparent)`, transform: 'rotate(80deg)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, ease: 'easeOut', delay: 0.8 }} />
        </div>

        <div className="relative z-10 max-w-[1400px] mx-auto px-6 sm:px-10 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-4 items-center">
            {/* Left — Massive Title */}
            <div className="max-w-2xl">
              <h1
                className="text-[clamp(3rem,9vw,7.5rem)] font-bold tracking-[-0.06em] leading-[0.85] mb-8 whitespace-nowrap"
                style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: 'var(--lp-text-heading)' }}
              >
                {'DocuVerse'.split('').map((char, i) => (
                  <motion.span
                    key={i}
                    className="inline-block"
                    initial={{ y: 120, opacity: 0, rotateX: -80 }}
                    animate={{ y: 0, opacity: 1, rotateX: 0 }}
                    transition={{
                      duration: 0.9,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.15 + i * 0.06,
                    }}
                    style={i >= 4 ? { fontStyle: 'italic', fontWeight: 300 } : {}}
                  >
                    {char}
                  </motion.span>
                ))}
              </h1>

              <motion.p
                className="text-[15px] sm:text-base leading-relaxed max-w-sm mb-10" style={{ color: 'var(--lp-text-body)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.6 }}
              >
                Elevate your understanding with AI-guided code walkthroughs and style. Our AI reads code like a senior engineer, narrates every file, and creates visual architecture maps.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.9 }}
              >
                <Link href={authTarget} onClick={handleAuthClick}
                  className="group inline-flex items-center gap-3 font-semibold text-[13px] tracking-[0.15em] uppercase px-8 py-4 active:scale-[0.97] transition-all duration-300" style={{ background: 'var(--lp-cta-bg)', color: 'var(--lp-cta-text)' }}>
                  Get Started Now
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                </Link>
              </motion.div>
            </div>

            {/* Right — Wireframe Art */}
            <motion.div
              className="relative lg:justify-self-center w-full max-w-[520px] aspect-square flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, ease, delay: 0.3 }}
            >
              <WireframeSphere />
            </motion.div>
          </div>
        </div>

        {/* Scroll cue */}
        <motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5, duration: 1 }}>
          <motion.div className="w-5 h-8 rounded-full border flex items-start justify-center p-1" style={{ borderColor: 'var(--lp-scroll-border)' }}>
            <motion.div className="w-1 h-1.5 rounded-full" style={{ background: 'var(--lp-scroll-dot)' }}
              animate={{ y: [0, 10, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── MARQUEE ─── */}
      <div className="relative py-8 border-y overflow-hidden" style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-bg)' }}>
        <div className="marquee-track flex gap-12 items-center whitespace-nowrap">
          {[...Array(2)].map((_, outer) => (
            <div key={outer} className="flex gap-12 items-center shrink-0 marquee-content">
              {['Python','TypeScript','React','Go','Rust','Java','Next.js','Node.js','Ruby','Kotlin','Swift','C++'].map((lang) => (
                <span key={`${outer}-${lang}`} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--lp-dot)' }} />
                  <span className="text-[13px] font-mono tracking-wide uppercase" style={{ color: 'var(--lp-marquee-text)' }}>{lang}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── PRODUCT PREVIEW ─── */}
      <section className="relative py-24 sm:py-32" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[1100px] mx-auto px-6 sm:px-10">
          <motion.div className="text-center mb-14"
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
            <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-4 font-medium" style={{ color: 'var(--lp-text-muted)' }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> See it in action
            </span>
            <h2 className="text-[clamp(1.5rem,4vw,2.5rem)] font-bold tracking-[-0.03em]" style={{ color: 'var(--lp-text-heading)' }}>
              Your code, narrated by AI
            </h2>
          </motion.div>

          <motion.div className="relative"
            initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }} transition={{ duration: 1, ease }}>
            {/* Browser mockup */}
            <div className="relative rounded-2xl overflow-hidden border shadow-[0_30px_80px_rgba(0,0,0,0.15)]" style={{ background: 'var(--lp-card)', borderColor: 'var(--lp-card-border)' }}>
              {/* Chrome bar */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ background: 'var(--lp-surface-hover)', borderColor: 'var(--lp-border)' }}>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]/70" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]/70" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]/70" />
                </div>
                <div className="flex-1 flex justify-center">
                  <span className="text-[11px] font-mono flex items-center gap-1.5" style={{ color: 'var(--lp-text-faint)' }}>
                    <FileCode className="w-3 h-3" /> auth_service.py
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                  <Headphones className="w-3 h-3" /> NARRATING
                </div>
              </div>

              {/* Code content */}
              <div className="font-mono text-[12.5px] leading-[2] p-5 sm:p-6">
                {[
                  { n: 1, hl: false, tokens: [{ t: 'class', c: '#c084fc' }, { t: ' AuthService', c: '#67e8f9' }, { t: ':', c: '#a5b4fc' }] },
                  { n: 2, hl: false, tokens: [{ t: '    ', c: '' }, { t: '"""Handle JWT authentication."""', c: '#4ade80' }] },
                  { n: 3, hl: false, tokens: [] },
                  { n: 4, hl: true, tokens: [{ t: '    ', c: '' }, { t: 'async', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'def', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'verify_token', c: '#818cf8' }, { t: '(self, token):', c: '#94a3b8' }] },
                  { n: 5, hl: true, tokens: [{ t: '        payload = jwt.', c: '#94a3b8' }, { t: 'decode', c: '#818cf8' }, { t: '(token)', c: '#94a3b8' }] },
                  { n: 6, hl: true, tokens: [{ t: '        user_id = payload.', c: '#94a3b8' }, { t: 'get', c: '#818cf8' }, { t: '(', c: '#94a3b8' }, { t: '"sub"', c: '#4ade80' }, { t: ')', c: '#94a3b8' }] },
                  { n: 7, hl: false, tokens: [{ t: '        ', c: '' }, { t: 'if', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'not', c: '#c084fc' }, { t: ' user_id:', c: '#94a3b8' }] },
                  { n: 8, hl: false, tokens: [{ t: '            ', c: '' }, { t: 'raise', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'InvalidCredentials', c: '#67e8f9' }, { t: '()', c: '#94a3b8' }] },
                  { n: 9, hl: false, tokens: [{ t: '        ', c: '' }, { t: 'return', c: '#c084fc' }, { t: ' ', c: '' }, { t: 'await', c: '#c084fc' }, { t: ' self.repo.', c: '#94a3b8' }, { t: 'get', c: '#818cf8' }, { t: '(id)', c: '#94a3b8' }] },
                ].map((l, i) => (
                  <motion.div key={l.n}
                    className={`flex items-center rounded-md px-2 -mx-2 ${l.hl ? 'bg-indigo-500/[0.06] border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}`}
                    initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: false }} transition={{ delay: i * 0.05, duration: 0.4, ease }}>
                    <span className="w-7 text-right text-[11px] select-none pr-3 shrink-0 font-mono" style={{ color: 'var(--lp-text-faint)' }}>{l.n}</span>
                    <span className="flex-1 whitespace-pre">
                      {l.tokens.map((tok, ti) => (<span key={ti} style={{ color: tok.c || '#94a3b8' }}>{tok.t}</span>))}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Audio bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-t" style={{ background: 'var(--lp-surface-hover)', borderColor: 'var(--lp-border)' }}>
                <button className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                  <Play className="w-3 h-3 text-white ml-[1px]" fill="white" />
                </button>
                <div className="flex-1 flex items-center gap-[2px] h-5">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <motion.div key={i} className="flex-1 rounded-full bg-indigo-500/50"
                      style={{ minWidth: 2 }}
                      initial={{ height: '30%' }}
                      animate={{ height: `${20 + Math.random() * 80}%` }}
                      transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, repeatType: 'reverse', delay: i * 0.02 }} />
                  ))}
                </div>
                <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--lp-text-faint)' }}>1:24</span>
              </div>
            </div>

            {/* Floating feature badges */}
            <motion.div className="absolute -top-4 -right-4 sm:-right-8 rounded-xl px-4 py-3 border shadow-[0_8px_30px_rgba(0,0,0,0.1)]" style={{ background: 'var(--lp-card)', borderColor: 'var(--lp-card-border)' }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }} transition={{ delay: 0.6, duration: 0.6, ease }}
              animate={{ y: [0, -6, 0] }} >
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-500" />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--lp-text-body)' }}>AI Narration Active</span>
              </div>
            </motion.div>

            <motion.div className="absolute -bottom-4 -left-4 sm:-left-8 rounded-xl px-4 py-3 border shadow-[0_8px_30px_rgba(0,0,0,0.1)]" style={{ background: 'var(--lp-card)', borderColor: 'var(--lp-card-border)' }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }} transition={{ delay: 0.8, duration: 0.6, ease }}
              animate={{ y: [0, -4, 0] }} >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--lp-text-body)' }}>Architecture Mapped</span>
              </div>
            </motion.div>

            {/* Shadow glow under mockup */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-[60px] bg-indigo-500/[0.06] rounded-full blur-[40px]" />
          </motion.div>
        </div>
      </section>

      {/* ─── WHAT'S INSIDE (Features) ─── */}
      <section id="what's-inside" className="relative py-32 sm:py-40" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
          <div className="mb-16 sm:mb-24">
            <motion.span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-5 font-medium" style={{ color: 'var(--lp-text-muted)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> What&apos;s Inside
            </motion.span>
            <motion.h2 className="text-[clamp(2rem,5vw,3.8rem)] font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: 'var(--lp-text-heading)' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
              Powerful features, built for<br />deep understanding
            </motion.h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <Mic className="w-6 h-6" />, title: 'AI Voice Narration', desc: 'An AI senior engineer narrates your code with perfectly synced audio. Line-by-line highlighting follows along.' },
              { icon: <Layers className="w-6 h-6" />, title: 'Architecture Diagrams', desc: 'Auto-generated flow charts and architecture diagrams for every file and module relationship.' },
              { icon: <Terminal className="w-6 h-6" />, title: 'Live Sandbox', desc: 'Run and test code snippets instantly, right inside the walkthrough. No setup needed.' },
              { icon: <Braces className="w-6 h-6" />, title: 'Tree-sitter AST', desc: 'Accurate function, class, and scope extraction across Python, JS, TS, Java, Go, and Rust.' },
              { icon: <Shield className="w-6 h-6" />, title: 'Private Repos', desc: 'Securely connect private GitHub repositories. Your code never leaves your session.' },
              { icon: <BarChart3 className="w-6 h-6" />, title: 'Impact Analysis', desc: 'See the blast radius of any change before you make it. Understand every dependency.' },
            ].map((feat, i) => (
              <motion.div key={feat.title}
                className="group relative p-8 border transition-all duration-500" style={{ background: 'var(--lp-card)', borderColor: 'var(--lp-card-border)' }}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.7, ease, delay: i * 0.08 }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-500" style={{ background: 'var(--lp-surface)', color: 'var(--lp-text-body)' }}>
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold tracking-tight mb-3" style={{ color: 'var(--lp-text-heading)' }}>{feat.title}</h3>
                <p className="text-[14px] leading-relaxed" style={{ color: 'var(--lp-text-label)' }}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="relative py-32 sm:py-40" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[1100px] mx-auto px-6 sm:px-10">
          <div className="mb-20 sm:mb-28">
            <motion.span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-5 font-medium" style={{ color: 'var(--lp-text-muted)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> How It Works
            </motion.span>
            <motion.h2 className="text-[clamp(2rem,5vw,3.8rem)] font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: 'var(--lp-text-heading)' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
              Three steps from repo<br />to understanding
            </motion.h2>
          </div>

          <div className="space-y-20 sm:space-y-28">
            {[
              { num: '01', icon: <GitBranch className="w-5 h-5" />, title: 'Drop in any GitHub repo', desc: 'Just connect your repository. DocuVerse clones the repo, analyses every file, and maps out every function, class, and dependency in seconds.' },
              { num: '02', icon: <Sparkles className="w-5 h-5" />, title: 'AI builds your walkthrough', desc: 'Our AI reads your code like a senior engineer and writes a clear, file-by-file narration. Text-to-speech generates perfectly synced audio.' },
              { num: '03', icon: <Play className="w-5 h-5" />, title: 'Explore, listen, and experiment', desc: 'Hit play and watch the code scroll in sync with AI narration. Tap into interactive architecture diagrams and spin up a live sandbox.' },
            ].map((step, i) => (
              <motion.div key={step.num} className="flex gap-8 sm:gap-12 items-start"
                initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, margin: '-80px' }} transition={{ duration: 0.8, ease, delay: i * 0.1 }}>
                <div className="shrink-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 border flex items-center justify-center" style={{ borderColor: 'var(--lp-card-border)', color: 'var(--lp-text-body)' }}>
                    {step.icon}
                  </div>
                </div>
                <div className="pt-1">
                  <span className="text-[12px] font-mono tracking-wider mb-3 block" style={{ color: 'var(--lp-text-faint)' }}>STEP {step.num}</span>
                  <h3 className="text-[clamp(1.3rem,3vw,2rem)] font-bold tracking-[-0.02em] mb-3" style={{ color: 'var(--lp-text-heading)' }}>{step.title}</h3>
                  <p className="text-[15px] sm:text-base leading-relaxed max-w-lg" style={{ color: 'var(--lp-text-muted)' }}>{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section className="relative py-24 sm:py-32 border-y" style={{ background: 'var(--lp-bg-alt)', borderColor: 'var(--lp-border-subtle)' }}>
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
                <motion.div key={stat.label} className="text-center lg:text-left"
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, margin: '-60px' }} transition={{ duration: 0.7, ease }}>
                  <div className="flex items-center justify-center lg:justify-start gap-2 mb-3" style={{ color: 'var(--lp-text-muted)' }}>{stat.icon}</div>
                  <span ref={ref} className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.03em]" style={{ color: 'var(--lp-text-heading)' }}>
                    {count.toLocaleString()}{stat.suffix}
                  </span>
                  <p className="text-[13px] mt-1 tracking-wide uppercase" style={{ color: 'var(--lp-text-muted)' }}>{stat.label}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── WHY DOCUVERSE ─── */}
      <section className="relative py-28 sm:py-36" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10">
          <div className="mb-16 sm:mb-20">
            <motion.span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-5 font-medium" style={{ color: 'var(--lp-text-muted)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> Why DocuVerse
            </motion.span>
            <motion.h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: 'var(--lp-text-heading)' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
              Not just documentation.<br />A whole new way to learn code.
            </motion.h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { icon: <Workflow className="w-6 h-6" />, title: 'Beyond static docs', desc: 'Traditional docs get stale. DocuVerse generates living walkthroughs that update with your code, synced to AI narration and interactive diagrams.', accent: '#000' },
              { icon: <Mic className="w-6 h-6" />, title: 'Audio-first understanding', desc: 'Listen to an AI senior engineer explain your code while you follow along visually. Learn on your commute, during lunch, or while reviewing PRs.', accent: '#000' },
              { icon: <Users className="w-6 h-6" />, title: 'Onboard 10x faster', desc: 'New engineers understand your codebase in hours, not weeks. Every function, class, and dependency is narrated with clear, contextual explanations.', accent: '#000' },
              { icon: <BookOpen className="w-6 h-6" />, title: 'IDE-native experience', desc: 'Access walkthroughs directly in VS Code and Cursor via our MCP server. No context-switching, no browser tabs — just understanding.', accent: '#000' },
            ].map((item, i) => (
              <motion.div key={item.title}
                className="group relative border p-8 sm:p-10 transition-all duration-500 hover:border-[var(--lp-border-hover)]" style={{ background: 'var(--lp-card)', borderColor: 'var(--lp-card-border)' }}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.7, ease, delay: i * 0.1 }}>
                <div className="flex items-start gap-5">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500" style={{ background: 'var(--lp-surface)', color: 'var(--lp-text-body)' }}>
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight mb-2" style={{ color: 'var(--lp-text-heading)' }}>{item.title}</h3>
                    <p className="text-[14px] leading-relaxed" style={{ color: 'var(--lp-text-label)' }}>{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="relative py-28 sm:py-36 overflow-hidden" style={{ background: 'var(--lp-bg-alt)' }}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10">
          <div className="mb-16 sm:mb-20">
            <motion.span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-5 font-medium" style={{ color: 'var(--lp-text-muted)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> What developers say
            </motion.span>
            <motion.h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: 'var(--lp-text-heading)' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
              Trusted by builders
            </motion.h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { quote: 'DocuVerse turned a 3-week onboarding into 2 days. The AI narration is like having a senior engineer walk you through every file.', name: 'Arjun M.', role: 'Senior Engineer', avatar: 'A' },
              { quote: 'I use the VS Code extension daily. It\'s like having a codebase tour guide that never gets tired. Game changer for our team.', name: 'Priya K.', role: 'Tech Lead', avatar: 'P' },
              { quote: 'The architecture diagrams alone saved us countless hours. Combined with audio walkthroughs, it\'s the best dev tool we\'ve adopted this year.', name: 'Rahul S.', role: 'Engineering Manager', avatar: 'R' },
            ].map((t, i) => (
              <motion.div key={t.name}
                className="relative border p-7 sm:p-8" style={{ borderColor: 'var(--lp-card-border)', background: 'var(--lp-card)' }}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.7, ease, delay: i * 0.12 }}>
                <MessageSquare className="w-5 h-5 mb-5" style={{ color: 'var(--lp-text-faint)' }} />
                <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'var(--lp-text-body)' }}>&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: 'var(--lp-surface)', color: 'var(--lp-text-label)' }}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--lp-text-heading)' }}>{t.name}</div>
                    <div className="text-[12px]" style={{ color: 'var(--lp-text-muted)' }}>{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="relative py-28 sm:py-36" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[800px] mx-auto px-6 sm:px-10">
          <div className="mb-14 sm:mb-20 text-center">
            <motion.span className="inline-flex items-center gap-2 text-[12px] tracking-[0.2em] uppercase mb-5 font-medium" style={{ color: 'var(--lp-text-muted)' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              <span className="w-8 h-[1px]" style={{ background: 'var(--lp-text-faint)' }} /> FAQ
            </motion.span>
            <motion.h2 className="text-[clamp(2rem,5vw,3rem)] font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: 'var(--lp-text-heading)' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
              Common questions
            </motion.h2>
          </div>

          <div className="space-y-3">
            {[
              { q: 'How does DocuVerse generate walkthroughs?', a: 'DocuVerse clones your repo, parses every file with tree-sitter for accurate AST extraction, then uses AI to generate a clear, contextual narration for each file. Audio is synthesized with text-to-speech and synced to code highlighting.' },
              { q: 'Is my code secure?', a: 'Absolutely. Your code is processed in isolated sessions and never stored permanently. Private repos are accessed through secure GitHub OAuth tokens that you can revoke at any time.' },
              { q: 'Which languages are supported?', a: 'Python, TypeScript, JavaScript, Java, Go, Rust, Ruby, Kotlin, Swift, C++, C#, and more. Our tree-sitter engine supports 12+ languages with accurate scope and dependency extraction.' },
              { q: 'Can I use DocuVerse in my IDE?', a: 'Yes! We offer a VS Code extension and an MCP server that works with Cursor and other AI-powered editors. Access walkthroughs, architecture diagrams, and impact analysis without leaving your IDE.' },
              { q: 'Is there a free plan?', a: 'Yes. You can get started for free with public repositories. Premium plans unlock private repos, team collaboration, priority audio generation, and the Signal feature for support ticket analysis.' },
            ].map((faq, i) => (
              <motion.div key={i}
                className="border overflow-hidden" style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-card)' }}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.5, ease, delay: i * 0.05 }}>
                <button
                  className="w-full flex items-center justify-between px-6 py-5 text-left group"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="text-[15px] font-semibold transition-colors pr-4" style={{ color: 'var(--lp-text-heading)' }}>{faq.q}</span>
                  <motion.div
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}>
                    <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--lp-text-muted)' }} />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}>
                      <div className="px-6 pb-5 text-[14px] leading-relaxed border-t pt-4" style={{ color: 'var(--lp-text-label)', borderColor: 'var(--lp-border-subtle)' }}>
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative py-40 sm:py-52 overflow-hidden" style={{ background: 'var(--lp-card)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-[400px] h-[400px] rounded-full bg-indigo-500/[0.03] blur-[80px]" />
          <div className="absolute bottom-[10%] right-[15%] w-[300px] h-[300px] rounded-full bg-purple-500/[0.03] blur-[60px]" />
        </div>
        <motion.div className="relative z-10 max-w-2xl mx-auto text-center px-6"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
          <h2 className="text-[clamp(2.2rem,6vw,4.5rem)] font-bold tracking-[-0.04em] leading-[0.95] mb-6" style={{ color: 'var(--lp-text-heading)' }}>
            Start building<br />understanding
          </h2>
          <p className="text-base sm:text-lg mb-12 leading-relaxed max-w-md mx-auto" style={{ color: 'var(--lp-text-label)' }}>
            Connect a repo. Get your first walkthrough in under 60 seconds. No credit card required.
          </p>
          <Link href="/auth/signin"
            className="group inline-flex items-center gap-3 font-semibold text-[13px] tracking-[0.15em] uppercase px-10 py-5 hover:bg-white/90 active:scale-[0.97] transition-all duration-300" style={{ background: 'var(--lp-cta-bg)', color: 'var(--lp-cta-text)' }}>
            Get Started Free
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
          </Link>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t py-12 sm:py-16" style={{ background: 'var(--lp-bg)', borderColor: 'var(--lp-border-subtle)' }}>
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="DocuVerse" className="w-6 h-6 rounded-md object-cover" />
                <span className="text-[14px] font-semibold" style={{ color: 'var(--lp-text-body)' }}>DocuVerse</span>
              </Link>
              <p className="text-[13px] max-w-xs" style={{ color: 'var(--lp-text-muted)' }}>Transform complex codebases into interactive, audio & visual walkthroughs.</p>
            </div>
            <div className="flex gap-10">
              <div className="space-y-3">
                <span className="text-[11px] tracking-[0.15em] uppercase font-medium" style={{ color: 'var(--lp-text-faint)' }}>Product</span>
                <div className="space-y-2">
                  <Link href="/demo" className="block text-[13px] transition-colors" style={{ color: 'var(--lp-text-label)' }}>Demo</Link>
                  <Link href="/mcp-guide" className="block text-[13px] transition-colors" style={{ color: 'var(--lp-text-label)' }}>IDE Plugin</Link>
                </div>
              </div>
              <div className="space-y-3">
                <span className="text-[11px] tracking-[0.15em] uppercase font-medium" style={{ color: 'var(--lp-text-faint)' }}>Company</span>
                <div className="space-y-2">
                  <Link href="/auth/signin" className="block text-[13px] transition-colors" style={{ color: 'var(--lp-text-label)' }}>Sign in</Link>
                  <span className="block text-[13px]" style={{ color: 'var(--lp-text-label)' }}>Team BitMask</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t flex items-center justify-between" style={{ borderColor: 'var(--lp-border-subtle)' }}>
            <span className="text-[12px]" style={{ color: 'var(--lp-text-faint)' }}>© 2026 DocuVerse</span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--lp-text-faint)' }}>Built with love by Logorhythms AI</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
