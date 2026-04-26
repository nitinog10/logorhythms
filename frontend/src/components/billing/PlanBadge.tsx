'use client'

import { Crown, Users, Zap } from 'lucide-react'

const TIER_CONFIG = {
  free: {
    label: 'Free',
    icon: Zap,
    bgClass: 'bg-white/[0.04]',
    textClass: 'text-white/40',
    borderClass: 'border-white/[0.06]',
  },
  pro: {
    label: 'Pro',
    icon: Crown,
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/20',
  },
  team: {
    label: 'Team',
    icon: Users,
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/20',
  },
} as const

interface PlanBadgeProps {
  tier: 'free' | 'pro' | 'team'
  size?: 'sm' | 'md'
  showIcon?: boolean
}

export default function PlanBadge({ tier, size = 'sm', showIcon = true }: PlanBadgeProps) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold tracking-wider uppercase
        ${config.bgClass} ${config.textClass} ${config.borderClass}
        ${size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[11px] px-3 py-1'}
      `}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />}
      {config.label}
    </span>
  )
}
