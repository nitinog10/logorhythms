'use client'

import { useRef, useState } from 'react'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
}

export default function TiltCard({ children, className = '' }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 })

  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const tiltX = (y - 0.5) * -10
    const tiltY = (x - 0.5) * 10

    setStyle({
      transform: `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.015,1.015,1.015)`,
      transition: 'transform 0.15s ease-out',
    })
    setGlowPos({ x: x * 100, y: y * 100 })
  }

  const handleLeave = () => {
    setStyle({
      transform: 'perspective(900px) rotateX(0) rotateY(0) scale3d(1,1,1)',
      transition: 'transform 0.5s ease-out',
    })
    setGlowPos({ x: 50, y: 50 })
  }

  return (
    /* Outer wrapper: isolates stacking context so border pseudo-el doesn't clip */
    <div className={`relative group ${className}`} style={{ isolation: 'isolate' }}>
      {/* Tilt surface — overflow visible so scale doesn't clip top/bottom */}
      <div
        ref={ref}
        className="relative w-full"
        style={{ ...style, overflow: 'visible' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {/* Animated gradient border on hover */}
        <div
          className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `conic-gradient(from 0deg at ${glowPos.x}% ${glowPos.y}%, #6366f1, #a855f7, #22d3ee, #6366f1)`,
            filter: 'blur(1px)',
            zIndex: -1,
          }}
        />
        {/* Inner radial glow */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(350px circle at ${glowPos.x}% ${glowPos.y}%, rgba(99,102,241,0.07), transparent 60%)`,
          }}
        />
        {children}
      </div>
    </div>
  )
}
