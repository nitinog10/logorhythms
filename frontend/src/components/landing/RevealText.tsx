'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

interface RevealTextProps {
  children: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
  className?: string
  delay?: number
  byWord?: boolean
}

export default function RevealText({
  children,
  as: Tag = 'p',
  className = '',
  delay = 0,
  byWord = true,
}: RevealTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const units = byWord ? children.split(' ') : children.split('')

  return (
    <Tag className={className} ref={ref as any}>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true" className="inline">
        {units.map((unit, i) => (
          <span key={i} className="inline-block overflow-hidden align-bottom">
            <motion.span
              className="inline-block"
              initial={{ y: '110%', opacity: 0 }}
              animate={isInView ? { y: '0%', opacity: 1 } : { y: '110%', opacity: 0 }}
              transition={{
                duration: 0.6,
                ease: [0.23, 1, 0.32, 1],
                delay: delay + i * (byWord ? 0.06 : 0.02),
              }}
            >
              {unit}
            </motion.span>
            {byWord && i < units.length - 1 && (
              <span className="inline-block w-[0.3em]" />
            )}
          </span>
        ))}
      </span>
    </Tag>
  )
}
