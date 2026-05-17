'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

const ease = [0.23, 1, 0.32, 1] as const

const faqs = [
  { q: 'How does DocuVerse generate walkthroughs?', a: 'DocuVerse clones your repo, parses every file with tree-sitter for accurate AST extraction, then uses AI to generate a clear, contextual narration for each file. Audio is synthesized with text-to-speech and synced to code highlighting.' },
  { q: 'Is my code secure?', a: 'Absolutely. Your code is processed in isolated sessions and never stored permanently. Private repos are accessed through secure GitHub OAuth tokens that you can revoke at any time.' },
  { q: 'Which languages are supported?', a: 'Python, TypeScript, JavaScript, Java, Go, Rust, Ruby, Kotlin, Swift, C++, C#, and more. Our tree-sitter engine supports 12+ languages with accurate scope and dependency extraction.' },
  { q: 'Can I use DocuVerse in my IDE?', a: 'Yes! We offer an MCP server that works with Cursor and other AI-powered editors. Access walkthroughs, architecture diagrams, and impact analysis without leaving your IDE.' },
  { q: 'Is there a free plan?', a: 'Yes. You can get started for free with public repositories. Premium plans unlock private repos, team collaboration, priority audio generation, and the Signal feature for support ticket analysis.' },
]

export default function RaycastFAQ() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <section className="relative py-28 sm:py-36" style={{ background: 'var(--lp-bg)' }}>
      <div className="max-w-[700px] mx-auto px-6">
        <div className="mb-14 text-center">
          <motion.p className="text-[14px] font-medium mb-4" style={{ color: 'var(--lp-accent)', letterSpacing: '0.2px' }}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false }}>
            FAQ
          </motion.p>
          <motion.h2 className="text-[40px] font-normal leading-[1.17]"
            style={{ color: 'var(--lp-text-heading)', letterSpacing: '0.2px' }}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease }}>
            Common questions
          </motion.h2>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <motion.div key={i} className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-card-border)',
                boxShadow: 'var(--lp-shadow-ring), var(--lp-shadow-ring-inset)',
              }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, margin: '-40px' }} transition={{ duration: 0.5, ease, delay: i * 0.05 }}>
              <button className="w-full flex items-center justify-between px-6 py-5 text-left group"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span className="text-[15px] font-medium pr-4 transition-opacity duration-200 group-hover:opacity-60" style={{ color: 'var(--lp-text-heading)', letterSpacing: '0.2px' }}>{faq.q}</span>
                <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.3, ease }}>
                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--lp-text-faint)' }} />
                </motion.div>
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }}>
                    <div className="px-6 pb-5 text-[16px] font-medium leading-[1.60]" style={{ color: 'var(--lp-text-muted)', borderTop: '1px solid var(--lp-border)', paddingTop: '16px', letterSpacing: '0.2px' }}>
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
  )
}
