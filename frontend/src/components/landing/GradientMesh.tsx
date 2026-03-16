'use client'

export default function GradientMesh({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      {/* Blob 1 — indigo, drifts top-left to center */}
      <div
        className="absolute w-[700px] h-[700px] rounded-full opacity-30 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
          top: '-10%',
          left: '-5%',
          animation: 'mesh-drift-1 18s ease-in-out infinite alternate',
        }}
      />
      {/* Blob 2 — purple, drifts right */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-25 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
          top: '20%',
          right: '-10%',
          animation: 'mesh-drift-2 22s ease-in-out infinite alternate',
        }}
      />
      {/* Blob 3 — cyan accent, bottom */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)',
          bottom: '-15%',
          left: '30%',
          animation: 'mesh-drift-3 20s ease-in-out infinite alternate',
        }}
      />

      {/* Noise overlay */}
      <div className="noise-overlay absolute inset-0" />
    </div>
  )
}
