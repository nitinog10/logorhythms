'use client'

interface UsageMeterProps {
  label: string
  used: number
  limit: number // -1 = unlimited
  compact?: boolean
}

export default function UsageMeter({ label, used, limit, compact = false }: UsageMeterProps) {
  if (limit === -1) {
    return compact ? null : (
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-white/40">{label}</span>
        <span className="text-emerald-400/70 font-mono">Unlimited</span>
      </div>
    )
  }

  const percent = Math.min((used / Math.max(limit, 1)) * 100, 100)
  const isNearLimit = percent >= 80
  const isAtLimit = percent >= 100

  const barColor = isAtLimit
    ? 'bg-red-500'
    : isNearLimit
    ? 'bg-amber-500'
    : 'bg-indigo-500'

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden max-w-[60px]">
          <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${percent}%` }} />
        </div>
        <span className={`text-[10px] font-mono ${isAtLimit ? 'text-red-400' : 'text-white/30'}`}>
          {used}/{limit}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-white/40">{label}</span>
        <span className={`text-[12px] font-mono ${isAtLimit ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-white/50'}`}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
