'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FolderGit2,
  Play,
  Zap,
  Settings,
  ChevronLeft,
  LogOut,
  Crown,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { useUserStore } from '@/lib/store'
import PlanBadge from '@/components/billing/PlanBadge'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { href: '/walkthroughs', label: 'Walkthroughs', icon: Play },
  { href: '/signal', label: 'Signal', icon: Zap },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { user, logout, subscription } = useUserStore()
  const currentTier = subscription?.tier || (user as any)?.subscriptionTier || 'free'

  useEffect(() => { setMounted(true) }, [])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  if (!mounted) {
    return (
      <aside className="h-screen w-[260px] bg-[var(--card-bg)]/80 backdrop-blur-2xl border-r border-[var(--card-border)] flex flex-col sticky top-0" />
    )
  }

  return (
    <aside
      className={clsx(
        'h-screen sticky top-0 bg-[var(--card-bg)]/80 backdrop-blur-2xl border-r border-[var(--card-border)] flex flex-col transition-all duration-300 relative group/sidebar',
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-[var(--text-faint)]">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="DocuVerse" className="w-8 h-8 rounded-[10px] flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)] object-cover" />
          <span
            className={clsx(
              'text-[15px] font-bold text-[var(--text-primary)] tracking-tight transition-all duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Docu<span className="text-indigo-400">Verse</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group/item relative active:scale-[0.98]',
                isActive
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-indigo-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className={clsx(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                isActive ? 'bg-indigo-500/15' : 'bg-[var(--input-bg)]'
              )}>
                <Icon className="w-[15px] h-[15px]" />
              </div>
              <span
                className={clsx(
                  'text-[14px] font-medium transition-all duration-300',
                  isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Upgrade button for free users */}
      {currentTier === 'free' && !isCollapsed && (
        <div className="px-3 pb-2">
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-indigo-400 text-[13px] font-medium hover:from-indigo-500/15 hover:to-purple-500/15 transition-all active:scale-[0.97]"
          >
            <Crown className="w-3.5 h-3.5" />
            Upgrade to Pro
          </Link>
        </div>
      )}

      {/* User section */}
      <div className="p-3 border-t border-[var(--text-faint)]">
        <div
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-xl',
            isCollapsed ? 'justify-center' : ''
          )}
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-8 h-8 rounded-full flex-shrink-0 ring-1 ring-[var(--input-border)]"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-400">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div
            className={clsx(
              'flex-1 min-w-0 transition-all duration-300',
              isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate flex items-center gap-2">
              {user?.username || 'Developer'}
              <PlanBadge tier={currentTier as 'free' | 'pro' | 'team'} />
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{user?.email || 'Connected'}</p>
          </div>
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-[0.92]"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={clsx(
          'absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-[var(--card-bg)] border border-[var(--input-border)] flex items-center justify-center',
          'hover:bg-[var(--hover-bg)] transition-all z-10 active:scale-[0.9]',
          'opacity-0 group-hover/sidebar:opacity-100'
        )}
      >
        <ChevronLeft
          className={clsx(
            'w-3 h-3 text-[var(--text-muted)] transition-transform duration-300',
            isCollapsed && 'rotate-180'
          )}
        />
      </button>
    </aside>
  )
}
