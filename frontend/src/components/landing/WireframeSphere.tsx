'use client'

import { motion } from 'framer-motion'

export default function WireframeSphere({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
      {/* Main orb container */}
      <div className="relative" style={{ width: '75%', aspectRatio: '1' }}>

        {/* Ambient glow behind orb */}
        <motion.div
          className="absolute inset-[-20%] rounded-full blur-[80px] opacity-30"
          style={{ background: 'conic-gradient(from 0deg, #6366f1, #a855f7, #6366f1)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
        />

        {/* The orb — layered gradients for depth */}
        <div className="relative w-full h-full rounded-full overflow-hidden"
          style={{ boxShadow: '0 40px 100px rgba(99,102,241,0.15), 0 10px 40px rgba(0,0,0,0.3), inset 0 -20px 60px rgba(0,0,0,0.4)' }}>

          {/* Base gradient — dark metallic */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--lp-orb-bg)' }}
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
          />

          {/* Moving color wash 1 — indigo */}
          <motion.div
            className="absolute inset-0 rounded-full opacity-70"
            style={{ background: 'radial-gradient(circle at 30% 30%, var(--lp-orb-glow), transparent 60%)' }}
            animate={{
              background: [
                'radial-gradient(circle at 30% 30%, var(--lp-orb-glow), transparent 60%)',
                'radial-gradient(circle at 70% 60%, rgba(168,85,247,0.4), transparent 60%)',
                'radial-gradient(circle at 40% 70%, var(--lp-orb-glow), transparent 60%)',
                'radial-gradient(circle at 30% 30%, var(--lp-orb-glow), transparent 60%)',
              ],
            }}
            transition={{ duration: 10, ease: 'easeInOut', repeat: Infinity }}
          />

          {/* Moving color wash 2 — purple */}
          <motion.div
            className="absolute inset-0 rounded-full opacity-50"
            style={{ background: 'radial-gradient(circle at 70% 20%, rgba(168,85,247,0.35), transparent 50%)' }}
            animate={{
              background: [
                'radial-gradient(circle at 70% 20%, rgba(168,85,247,0.35), transparent 50%)',
                'radial-gradient(circle at 30% 50%, rgba(34,211,238,0.25), transparent 50%)',
                'radial-gradient(circle at 60% 80%, rgba(168,85,247,0.3), transparent 50%)',
                'radial-gradient(circle at 70% 20%, rgba(168,85,247,0.35), transparent 50%)',
              ],
            }}
            transition={{ duration: 14, ease: 'easeInOut', repeat: Infinity }}
          />

          {/* Glass highlight — top-left reflection */}
          <div
            className="absolute rounded-full"
            style={{
              width: '60%',
              height: '50%',
              top: '8%',
              left: '12%',
              background: 'linear-gradient(165deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)',
              filter: 'blur(2px)',
            }}
          />

          {/* Small specular highlight */}
          <div
            className="absolute rounded-full"
            style={{
              width: '18%',
              height: '12%',
              top: '18%',
              left: '25%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.35), transparent 70%)',
              filter: 'blur(4px)',
            }}
          />

          {/* Rim light — bottom edge */}
          <div
            className="absolute rounded-full"
            style={{
              width: '70%',
              height: '20%',
              bottom: '10%',
              left: '15%',
              background: 'linear-gradient(0deg, rgba(99,102,241,0.15), transparent)',
              filter: 'blur(8px)',
            }}
          />

          {/* Inner rotating rings for texture */}
          {[0.4, 0.55, 0.7, 0.85].map((scale, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${scale * 100}%`,
                height: `${scale * 100}%`,
                left: `${(1 - scale) * 50}%`,
                top: `${(1 - scale) * 50}%`,
                border: '1px solid var(--lp-border-subtle)',
              }}
              animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
              transition={{ duration: 50 + i * 15, ease: 'linear', repeat: Infinity }}
            />
          ))}
        </div>

        {/* Orbit ring 1 — tilted, visible */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '125%',
            height: '125%',
            left: '-12.5%',
            top: '-12.5%',
            border: '1px solid var(--lp-orb-ring-1)',
            transformStyle: 'preserve-3d',
          }}
          animate={{ rotateX: [65, 72, 65], rotateY: [0, 360] }}
          transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
        />

        {/* Orbit ring 2 — wider, opposite direction */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '145%',
            height: '145%',
            left: '-22.5%',
            top: '-22.5%',
            border: '1px solid var(--lp-orb-ring-2)',
            transformStyle: 'preserve-3d',
          }}
          animate={{ rotateX: [50, 58, 50], rotateY: [0, -360] }}
          transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
        />

        {/* Orbit ring 3 — tightest */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '110%',
            height: '110%',
            left: '-5%',
            top: '-5%',
            border: '1px solid var(--lp-orb-ring-3)',
            transformStyle: 'preserve-3d',
          }}
          animate={{ rotateX: [75, 80, 75], rotateY: [0, 360] }}
          transition={{ duration: 15, ease: 'linear', repeat: Infinity }}
        />

        {/* Orbiting dots */}
        {[
          { ring: 125, dur: 20, rx: 65, size: 4, color: 'rgba(99,102,241,0.6)' },
          { ring: 145, dur: 30, rx: 50, size: 3, color: 'rgba(168,85,247,0.5)' },
          { ring: 110, dur: 15, rx: 75, size: 3, color: 'rgba(34,211,238,0.5)' },
        ].map((d, i) => (
          <motion.div
            key={`dot-${i}`}
            className="absolute"
            style={{
              width: `${d.ring}%`,
              height: `${d.ring}%`,
              left: `${(100 - d.ring) / 2}%`,
              top: `${(100 - d.ring) / 2}%`,
              transformStyle: 'preserve-3d',
            }}
            animate={{ rotateX: [d.rx, d.rx + 7, d.rx], rotateY: [0, i % 2 === 0 ? 360 : -360] }}
            transition={{ duration: d.dur, ease: 'linear', repeat: Infinity }}
          >
            <div
              className="absolute rounded-full"
              style={{
                width: `${d.size}px`,
                height: `${d.size}px`,
                background: d.color,
                boxShadow: `0 0 8px ${d.color}`,
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* Floor glow */}
      <div
        className="absolute bottom-[2%] left-1/2 -translate-x-1/2 w-[55%] h-[50px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }}
      />
    </div>
  )
}
