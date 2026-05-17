'use client'

import { motion } from 'framer-motion'
import RaycastNav from '@/components/landing/RaycastNav'
import RaycastHero from '@/components/landing/RaycastHero'
import RaycastProductPreview from '@/components/landing/RaycastProductPreview'
import RaycastSelectCode from '@/components/landing/RaycastSelectCode'
import RaycastFeatures from '@/components/landing/RaycastFeatures'
import RaycastHowItWorks from '@/components/landing/RaycastHowItWorks'
import RaycastStats from '@/components/landing/RaycastStats'
import RaycastFAQ from '@/components/landing/RaycastFAQ'
import RaycastMCP from '@/components/landing/RaycastMCP'
import RaycastCTAFooter from '@/components/landing/RaycastCTAFooter'

export default function HomePage() {
  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        background: 'var(--lp-bg)',
        color: 'rgb(var(--lp-text))',
        fontFeatureSettings: '"calt" 1, "kern" 1, "liga" 1, "ss03" 1',
        letterSpacing: '0.2px',
      }}
    >
      <RaycastNav />
      <RaycastHero />

      {/* ─── MARQUEE ─── */}
      <div className="relative py-8 overflow-hidden" style={{ borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)', background: 'var(--lp-bg)' }}>
        <div className="marquee-track flex gap-12 items-center whitespace-nowrap">
          {[...Array(2)].map((_, outer) => (
            <div key={outer} className="flex gap-12 items-center shrink-0 marquee-content">
              {['Python', 'TypeScript', 'React', 'Go', 'Rust', 'Java', 'Next.js', 'Node.js', 'Ruby', 'Kotlin', 'Swift', 'C++'].map((lang) => (
                <span key={`${outer}-${lang}`} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--lp-dot)' }} />
                  <span className="text-[13px] font-mono font-medium tracking-wide uppercase" style={{ color: 'var(--lp-marquee-text)', letterSpacing: '0.3px' }}>{lang}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <RaycastProductPreview />
      <RaycastSelectCode />
      <RaycastFeatures />
      <RaycastHowItWorks />
      <RaycastStats />

      {/* ─── WHY DOCUVERSE ─── */}
      <section className="relative py-28 sm:py-36" style={{ background: 'var(--lp-bg)' }}>
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="mb-16">
            <motion.p className="text-[14px] font-medium mb-4" style={{ color: 'var(--lp-accent)', letterSpacing: '0.2px' }}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
              Why DocuVerse
            </motion.p>
            <motion.h2 className="text-[56px] font-normal leading-[1.17] max-w-2xl"
              style={{ color: 'var(--lp-text-heading)', letterSpacing: '0.2px' }}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}>
              Not just documentation.{'\n'}A whole new way to learn code.
            </motion.h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { title: 'Beyond static docs', desc: 'Traditional docs get stale. DocuVerse generates living walkthroughs that update with your code, synced to AI narration and interactive diagrams.' },
              { title: 'Audio-first understanding', desc: 'Listen to an AI senior engineer explain your code while you follow along visually. Learn on your commute, during lunch, or while reviewing PRs.' },
              { title: 'Onboard 10x faster', desc: 'New engineers understand your codebase in hours, not weeks. Every function, class, and dependency is narrated with clear, contextual explanations.' },
              { title: 'IDE-native experience', desc: 'Access walkthroughs directly in Cursor via our MCP server. No context-switching, no browser tabs — just understanding.' },
            ].map((item, i) => (
              <motion.div key={item.title}
                className="group relative rounded-2xl p-8 sm:p-10 transition-all duration-300"
                style={{
                  background: 'var(--lp-card)',
                  border: '1px solid var(--lp-card-border)',
                  boxShadow: 'var(--lp-shadow-ring), var(--lp-shadow-ring-inset)',
                }}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: i * 0.1 }}
                whileHover={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                <h3 className="text-[22px] font-normal leading-[1.15] mb-3" style={{ color: 'var(--lp-text-heading)' }}>{item.title}</h3>
                <p className="text-[16px] font-medium leading-[1.60]" style={{ color: 'var(--lp-text-muted)', letterSpacing: '0.2px' }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MCP INTEGRATION ─── */}
      <RaycastMCP />

      <RaycastFAQ />
      <RaycastCTAFooter />
    </div>
  )
}
