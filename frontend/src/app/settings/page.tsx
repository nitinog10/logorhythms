'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Palette,
  CreditCard,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Check,
  Sparkles,
  Type,
  Eye,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { useUserStore, useUIStore, type ThemeMode, type FontSize } from '@/lib/store'
import { auth } from '@/lib/api'
import GradientMesh from '@/components/landing/GradientMesh'

const ease = [0.23, 1, 0.32, 1] as const



const fontSizeOptions: { id: FontSize; label: string; desc: string }[] = [
  { id: 'small', label: 'Small', desc: 'Compact interface' },
  { id: 'default', label: 'Default', desc: 'Standard sizing' },
  { id: 'large', label: 'Large', desc: 'Easier to read' },
]

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('account')
  const [mounted, setMounted] = useState(false)
  const user = useUserStore((s) => s.user)
  const token = useUserStore((s) => s.token)
  const setUser = useUserStore((s) => s.setUser)
  const logout = useUserStore((s) => s.logout)
  const router = useRouter()

  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const fontSize = useUIStore((s) => s.fontSize)
  const setFontSize = useUIStore((s) => s.setFontSize)
  const reducedMotion = useUIStore((s) => s.reducedMotion)
  const setReducedMotion = useUIStore((s) => s.setReducedMotion)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (token && !user) {
      auth.getMe().then((data) => {
        setUser({
          id: data.id,
          username: data.username,
          email: data.email,
          avatarUrl: data.avatar_url,
        })
      }).catch(() => {})
    }
  }, [token, user, setUser])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const sections = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ]

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex text-[var(--text-primary)] selection:bg-indigo-500/30">
      <Sidebar />

      <main className="flex-1 overflow-y-auto relative">
        {/* Gradient mesh */}
        <GradientMesh className="fixed" style={{ opacity: 'var(--glow-opacity)' }} />

        {/* Frosted top bar */}
        <div className="sticky top-0 z-20 bg-[var(--page-bar-bg)] backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-8 h-14 max-w-[1100px] mx-auto">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Settings</h1>
            <Link
              href="/dashboard"
              className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1.5"
            >
              Dashboard <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="relative z-[1] flex gap-8 px-8 py-10 max-w-[1100px] mx-auto">

          {/* ── Left nav ── */}
          <div className="w-56 flex-shrink-0">
            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden">
              {sections.map((section, i) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
                      i < sections.length - 1 ? 'border-b border-[var(--text-faint)]' : ''
                    } ${
                      isActive
                        ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isActive ? 'bg-indigo-500/15' : 'bg-[var(--input-bg)]'
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : ''}`} />
                    </div>
                    <span className="text-[13px] font-medium">{section.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="settings-nav"
                        className="ml-auto w-1 h-3.5 rounded-full bg-indigo-500"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 mt-4 text-red-400/70 hover:bg-red-500/8 rounded-2xl transition-all active:scale-[0.98]"
            >
              <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                <LogOut className="w-3.5 h-3.5 text-red-400" />
              </div>
              <span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 max-w-2xl">
            <AnimatePresence mode="wait">

              {/* ════════ ACCOUNT ════════ */}
              {activeSection === 'account' && (
                <motion.div
                  key="account"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease }}
                  className="space-y-5"
                >
                  <SettingsCard>
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] mb-6">Profile</h2>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 p-[2px]">
                        <div className="w-full h-full rounded-full bg-[var(--card-bg)] flex items-center justify-center overflow-hidden">
                          {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-8 h-8 text-indigo-400" />
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold">{user?.username || 'User'}</p>
                        <p className="text-[13px] text-[var(--text-muted)]">{user?.email || 'No email'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-2">Username</label>
                        <input
                          type="text"
                          defaultValue={user?.username || ''}
                          className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-[13px] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/25 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-2">Email</label>
                        <input
                          type="email"
                          defaultValue={user?.email || ''}
                          className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-2.5 text-[13px] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500/25 transition-all"
                        />
                      </div>
                    </div>

                    <button className="mt-6 inline-flex items-center gap-2 bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[13px] px-6 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300">
                      Save Changes
                    </button>
                  </SettingsCard>

                  <SettingsCard>
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] mb-5">Connected Accounts</h2>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--hover-bg)] border border-[var(--card-border)]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--input-bg)] flex items-center justify-center">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[14px] font-medium">GitHub</p>
                          <p className="text-[12px] text-[var(--text-muted)]">@{user?.username || 'user'}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-[11px] font-semibold">
                        Connected
                      </span>
                    </div>
                  </SettingsCard>
                </motion.div>
              )}

              {/* ════════ APPEARANCE ════════ */}
              {activeSection === 'appearance' && (
                <motion.div
                  key="appearance"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease }}
                  className="space-y-5"
                >
                  {/* Theme */}
                  <SettingsCard>
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] mb-2">Theme</h2>
                    <p className="text-[13px] text-[var(--text-muted)] mb-5">Choose how DocuVerse looks to you.</p>

                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { id: 'dark' as ThemeMode, label: 'Dark', icon: Moon, desc: 'Pure black' },
                        { id: 'light' as ThemeMode, label: 'Light', icon: Sun, desc: 'Bright mode' },
                        { id: 'system' as ThemeMode, label: 'System', icon: Monitor, desc: 'Match OS' },
                      ]).map((t) => {
                        const Icon = t.icon
                        const isSelected = theme === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={`relative p-5 rounded-2xl border transition-all active:scale-[0.97] text-center ${
                              isSelected
                                ? 'border-indigo-500/40 bg-indigo-500/8 shadow-[0_0_20px_rgba(99,102,241,0.08)]'
                                : 'border-[var(--card-border)] bg-[var(--hover-bg)] hover:bg-[var(--input-bg)]'
                            }`}
                          >
                            {isSelected && (
                              <motion.div
                                layoutId="theme-check"
                                className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                              >
                                <Check className="w-3 h-3 text-white" />
                              </motion.div>
                            )}
                            <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-indigo-400' : 'text-[var(--text-muted)]'}`} />
                            <span className="text-[13px] font-semibold block">{t.label}</span>
                            <span className="text-[11px] text-[var(--text-muted)]">{t.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </SettingsCard>



                  {/* Font Size */}
                  <SettingsCard>
                    <div className="flex items-center gap-2 mb-2">
                      <Type className="w-4 h-4 text-[var(--text-muted)]" />
                      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Font Size</h2>
                    </div>
                    <p className="text-[13px] text-[var(--text-muted)] mb-5">Adjust the interface text size.</p>

                    <div className="grid grid-cols-3 gap-3">
                      {fontSizeOptions.map((opt) => {
                        const isSelected = fontSize === opt.id
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setFontSize(opt.id)}
                            className={`relative p-4 rounded-xl border transition-all active:scale-[0.97] text-left ${
                              isSelected
                                ? 'border-indigo-500/40 bg-indigo-500/8'
                                : 'border-[var(--card-border)] bg-[var(--hover-bg)] hover:bg-[var(--input-bg)]'
                            }`}
                          >
                            {isSelected && (
                              <motion.div
                                layoutId="fontsize-check"
                                className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                              >
                                <Check className="w-2.5 h-2.5 text-white" />
                              </motion.div>
                            )}
                            <span className={`font-semibold block mb-0.5 ${
                              opt.id === 'small' ? 'text-[12px]' : opt.id === 'large' ? 'text-[16px]' : 'text-[14px]'
                            }`}>{opt.label}</span>
                            <span className="text-[11px] text-[var(--text-muted)]">{opt.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </SettingsCard>

                  {/* Accessibility */}
                  <SettingsCard>
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4 text-[var(--text-muted)]" />
                      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Accessibility</h2>
                    </div>
                    <p className="text-[13px] text-[var(--text-muted)] mb-5">Visual comfort options.</p>

                    <PremiumToggle
                      label="Reduce motion"
                      description="Minimize animations throughout the interface"
                      checked={reducedMotion}
                      onChange={setReducedMotion}
                    />
                  </SettingsCard>
                </motion.div>
              )}

              {/* ════════ BILLING ════════ */}
              {activeSection === 'billing' && (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease }}
                  className="space-y-5"
                >
                  <SettingsCard>
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] mb-5">Current Plan</h2>

                    <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-indigo-500/10 border border-indigo-500/15">
                      <div className="absolute top-3 right-3">
                        <Sparkles className="w-5 h-5 text-indigo-400/30" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[20px] font-bold tracking-[-0.02em]">Free Plan</p>
                          <p className="text-[13px] text-[var(--text-muted)] mt-1">5 walkthroughs per month</p>
                        </div>
                        <button className="inline-flex items-center gap-2 bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] font-semibold text-[13px] px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_var(--accent-glow)] active:scale-[0.97] transition-all duration-300">
                          Upgrade to Pro
                        </button>
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard>
                    <h2 className="text-[18px] font-semibold tracking-[-0.02em] mb-5">Usage</h2>

                    <div className="space-y-5">
                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-[14px] text-[var(--text-secondary)]">Walkthroughs</span>
                          <span className="text-[12px] font-semibold">3 / 5</span>
                        </div>
                        <div className="h-2 bg-[var(--input-bg)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '60%' }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-[14px] text-[var(--text-secondary)]">Audio minutes</span>
                          <span className="text-[12px] font-semibold">12 / 30</span>
                        </div>
                        <div className="h-2 bg-[var(--input-bg)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '40%' }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                            className="h-full bg-gradient-to-r from-green-500 to-cyan-400 rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                  </SettingsCard>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ── Shared settings card wrapper ── */
function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 shadow-[var(--card-shadow)]">
      {children}
    </div>
  )
}

/* ── Premium Toggle ── */
function PremiumToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-[51px] h-[31px] rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-green-500' : 'bg-[var(--glass-16)]'
        }`}
      >
        <motion.div
          className="absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          animate={{ left: checked ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      </button>
    </div>
  )
}
