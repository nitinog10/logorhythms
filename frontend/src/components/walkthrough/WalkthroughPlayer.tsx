'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  Maximize2,
  MessageSquare,
  Clock,
} from 'lucide-react'
import { clsx } from 'clsx'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScriptSegment {
  id: string
  order: number
  text: string
  startLine: number
  endLine: number
  highlightLines: number[]
  durationEstimate: number
  codeContext?: string
}

interface WalkthroughScript {
  id: string
  filePath: string
  title: string
  summary: string
  totalDuration: number
  segments: ScriptSegment[]
}

/** Mirrors backend AudioSegment – handles both camelCase and snake_case. */
interface AudioSegmentTiming {
  startTime: number
  endTime: number
}

export interface CodeSelection {
  code: string
  startLine: number
  endLine: number
}

interface WalkthroughPlayerProps {
  code: string
  script: WalkthroughScript
  filePath: string
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
  onCodeSelect?: (selection: CodeSelection | null) => void
  selectedLines?: { start: number; end: number } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

/** Normalise an audio‐segment object coming from the API (snake or camel). */
function normaliseSegmentTiming(raw: any): AudioSegmentTiming {
  return {
    startTime: raw.startTime ?? raw.start_time ?? 0,
    endTime: raw.endTime ?? raw.end_time ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WalkthroughPlayer({
  code,
  script,
  filePath,
  isPlaying,
  onPlayingChange,
  onCodeSelect,
  selectedLines,
}: WalkthroughPlayerProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [segmentProgress, setSegmentProgress] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showTranscript, setShowTranscript] = useState(true)

  // Audio pipeline state
  const [audioReady, setAudioReady] = useState(false)
  const [audioLoading, setAudioLoading] = useState(true)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)
  const [segmentTimings, setSegmentTimings] = useState<AudioSegmentTiming[]>([])
  const [displayTime, setDisplayTime] = useState(0)
  const [audioRetryCount, setAudioRetryCount] = useState(0)

  // ── Refs ────────────────────────────────────────────────────────────────
  const codeContainerRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const currentSegmentIndexRef = useRef(currentSegmentIndex)
  const onPlayingChangeRef = useRef(onPlayingChange)

  useEffect(() => { currentSegmentIndexRef.current = currentSegmentIndex }, [currentSegmentIndex])
  useEffect(() => { onPlayingChangeRef.current = onPlayingChange }, [onPlayingChange])

  // ── Derived ─────────────────────────────────────────────────────────────
  const safeIndex = Math.min(currentSegmentIndex, Math.max(script.segments.length - 1, 0))
  const currentSegment = script.segments.length > 0 ? script.segments[safeIndex] : undefined
  const lines = code.split('\n')

  // ── Poll for server-generated audio (ElevenLabs) ────────────────────────
  // Wait for the backend to finish generating audio, then make it available.
  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let pollInterval = 3000 // start at 3s
    let pollCount = 0
    const MAX_POLLS = 40 // ~2 minutes total

    const fetchAudio = async () => {
      const token = getAuthToken()
      if (!token) {
        setAudioLoading(false)
        setAudioError('Not authenticated')
        return
      }

      try {
        // 1. Check if the backend has finished generating audio
        const metaRes = await fetch(
          `${API_BASE_URL}/walkthroughs/${script.id}/audio`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (metaRes.status === 202) {
          pollCount++
          if (pollCount >= MAX_POLLS) {
            setAudioLoading(false)
            setAudioError('Audio generation timed out. Try regenerating the walkthrough.')
            return
          }
          // Audio still generating – poll again with backoff (max 6s)
          pollInterval = Math.min(pollInterval + 500, 6000)
          if (!cancelled) pollTimer = setTimeout(fetchAudio, pollInterval)
          return
        }
        if (!metaRes.ok) {
          const errBody = await metaRes.json().catch(() => null)
          const errMsg = errBody?.message || 'Audio generation failed – check ElevenLabs API key and quota'
          setAudioLoading(false)
          setAudioError(errMsg)
          return
        }

        const meta = await metaRes.json()
        if (cancelled) return

        // Normalise timings (handles both snake_case and camelCase)
        const timings: AudioSegmentTiming[] = (
          meta.audioSegments ?? meta.audio_segments ?? []
        ).map(normaliseSegmentTiming)

        // 2. Fetch the actual audio stream as a blob
        const streamRes = await fetch(
          `${API_BASE_URL}/walkthroughs/${script.id}/audio/stream`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!streamRes.ok) {
          setAudioLoading(false)
          setAudioError('Failed to fetch audio stream')
          return
        }

        // Verify response is actually audio
        const contentType = streamRes.headers.get('content-type') || ''
        if (!contentType.includes('audio')) {
          setAudioLoading(false)
          setAudioError('Invalid audio format received')
          return
        }

        const blob = await streamRes.blob()
        if (cancelled) return

        // Guard: if the blob is empty or too small, it's not valid audio
        if (!blob || blob.size < 100) {
          setAudioLoading(false)
          setAudioError('Audio file is empty or corrupted')
          return
        }

        // Audio is ready
        const url = URL.createObjectURL(blob)
        setSegmentTimings(timings)
        setAudioBlobUrl(url)
        setAudioReady(true)
        setAudioLoading(false)
        console.info('🔊 AI voice ready')
      } catch {
        if (!cancelled) {
          setAudioLoading(false)
          setAudioError('Failed to load audio')
        }
      }
    }

    // Start polling after a short delay (give backend time to start generating)
    setAudioLoading(true)
    setAudioError(null)
    setAudioReady(false)
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl)
      setAudioBlobUrl(null)
    }
    pollTimer = setTimeout(fetchAudio, 2000)
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [script.id, audioRetryCount])

  /** Retry audio generation – calls backend regenerate endpoint, then re-polls */
  const retryAudio = useCallback(async () => {
    const token = getAuthToken()
    if (!token) return
    try {
      await fetch(`${API_BASE_URL}/walkthroughs/${script.id}/audio/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* ignore – polling will pick up status */ }
    setAudioRetryCount((c) => c + 1)
  }, [script.id])

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => { if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl) }
  }, [audioBlobUrl])



  // ── Sync audio element ↔ play state ─────────────────────────────────────
  useEffect(() => {
    if (audioReady && audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(console.error)
      else audioRef.current.pause()
    }
  }, [isPlaying, audioReady, currentSegmentIndex])

  // ── Sync playback speed / mute with <audio> ────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed
  }, [playbackSpeed])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted
  }, [isMuted])

  // ── Audio timeupdate → segment sync ─────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio || segmentTimings.length === 0) return

    const t = audio.currentTime
    setDisplayTime(t)

    for (let i = 0; i < segmentTimings.length; i++) {
      const seg = segmentTimings[i]
      if (t >= seg.startTime && t < seg.endTime) {
        setCurrentSegmentIndex(i)
        const dur = seg.endTime - seg.startTime
        setSegmentProgress(dur > 0 ? ((t - seg.startTime) / dur) * 100 : 0)
        return
      }
    }

    // Past all segments
    const last = segmentTimings[segmentTimings.length - 1]
    if (last && t >= last.endTime) {
      setCurrentSegmentIndex(segmentTimings.length - 1)
      setSegmentProgress(100)
    }
  }, [segmentTimings])

  const handleAudioEnded = useCallback(() => {
    onPlayingChange(false)
    setSegmentProgress(100)
  }, [onPlayingChange])

  /** If the <audio> element fails to load/play, show error. */
  const handleAudioError = useCallback(() => {
    console.warn('Audio element playback error')
    setAudioReady(false)
    setAudioError('Audio playback failed. Try regenerating the walkthrough.')
    // Revoke the broken blob URL so it doesn't retry
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl)
      setAudioBlobUrl(null)
    }
  }, [audioBlobUrl])

  // ── Audio-driven progress timer ─────────────────────────────────────────
  // (no browser TTS progress timer needed — we only use real audio)

  // ── Progress / time computation ─────────────────────────────────────────
  const audioDuration = audioRef.current?.duration || script.totalDuration

  const totalProgress = (() => {
    if (audioReady && audioRef.current && audioRef.current.duration) {
      return (displayTime / audioRef.current.duration) * 100
    }
    // Fallback estimate
    if (!currentSegment || !script.segments.length) return 0
    const completedDuration = script.segments
      .slice(0, currentSegmentIndex)
      .reduce((sum, seg) => sum + seg.durationEstimate, 0)
    const currentDuration = currentSegment.durationEstimate * (segmentProgress / 100)
    return script.totalDuration > 0
      ? ((completedDuration + currentDuration) / script.totalDuration) * 100
      : 0
  })()

  // ── Auto-scroll code viewer ─────────────────────────────────────────────
  useEffect(() => {
    if (codeContainerRef.current && currentSegment) {
      const targetLine = currentSegment.startLine
      const lineHeight = 28
      const scrollTarget = (targetLine - 5) * lineHeight
      codeContainerRef.current.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth',
      })
    }
  }, [currentSegment])

  // ── Text selection handler ("Explain this code") ─────────────────────
  const handleCodeMouseUp = useCallback(() => {
    if (!onCodeSelect) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      return // don't clear selection on empty click — let parent decide
    }

    const selectedText = sel.toString().trim()
    if (selectedText.length < 3) return // too short

    // Find line range from selection anchor/focus
    const container = codeContainerRef.current
    if (!container) return

    const range = sel.getRangeAt(0)
    // Walk up to find line elements and extract line numbers
    const startEl = range.startContainer.parentElement?.closest('[data-line]')
    const endEl = range.endContainer.parentElement?.closest('[data-line]')
    const startLine = startEl ? parseInt(startEl.getAttribute('data-line') || '1', 10) : 1
    const endLine = endEl ? parseInt(endEl.getAttribute('data-line') || '1', 10) : startLine

    onCodeSelect({
      code: selectedText,
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
    })
  }, [onCodeSelect])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSkipBack = () => {
    if (currentSegmentIndex > 0) {
      const prevIdx = currentSegmentIndex - 1
      if (audioReady && audioRef.current && segmentTimings[prevIdx]) {
        audioRef.current.currentTime = segmentTimings[prevIdx].startTime
      }
      setCurrentSegmentIndex(prevIdx)
      setSegmentProgress(0)
    }
  }

  const handleSkipForward = () => {
    if (currentSegmentIndex < script.segments.length - 1) {
      const nextIdx = currentSegmentIndex + 1
      if (audioReady && audioRef.current && segmentTimings[nextIdx]) {
        audioRef.current.currentTime = segmentTimings[nextIdx].startTime
      }
      setCurrentSegmentIndex(nextIdx)
      setSegmentProgress(0)
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const percentage = (e.clientX - rect.left) / rect.width

    if (audioReady && audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = percentage * audioRef.current.duration
      return
    }

    // Fallback: estimate segment from percentage
    let accumulatedDuration = 0
    for (let i = 0; i < script.segments.length; i++) {
      const segPct = (script.segments[i].durationEstimate / script.totalDuration) * 100
      if ((accumulatedDuration + segPct) >= percentage * 100) {
        setCurrentSegmentIndex(i)
        const within = ((percentage * 100 - accumulatedDuration) / segPct) * 100
        setSegmentProgress(Math.max(0, Math.min(100, within)))
        break
      }
      accumulatedDuration += segPct
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentTime = (() => {
    if (audioReady && displayTime > 0) return displayTime
    if (!currentSegment || !script.segments.length) return 0
    const completed = script.segments
      .slice(0, currentSegmentIndex)
      .reduce((sum, seg) => sum + seg.durationEstimate, 0)
    return completed + (currentSegment.durationEstimate * (segmentProgress / 100))
  })()

  return (
    <div className="h-full flex flex-col">
      {/* Hidden <audio> element – drives ElevenLabs playback */}
      {audioBlobUrl && (
        <audio
          ref={audioRef}
          src={audioBlobUrl}
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleAudioEnded}
          onError={handleAudioError}
        />
      )}

      {/* Audio status */}
      {audioLoading && (
        <div className="flex items-center gap-2 px-4 py-2 bg-dv-accent/8 border-b border-dv-border-subtle ios-caption2 text-dv-accent">
          <div className="w-3 h-3 border-2 border-dv-accent/30 border-t-dv-accent rounded-full animate-spin" />
          Preparing AI voice…
        </div>
      )}
      {audioReady && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-dv-success/8 border-b border-dv-border-subtle ios-caption2 text-dv-success">
          🔊 AI voice ready
        </div>
      )}
      {audioError && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-dv-error/8 border-b border-dv-border-subtle ios-caption2 text-dv-error">
          <span>⚠️ {audioError}</span>
          <button
            onClick={retryAudio}
            className="ml-auto px-3 py-1 rounded-[8px] bg-dv-accent/15 text-dv-accent text-xs font-medium hover:bg-dv-accent/25 transition-colors"
          >
            Retry Audio
          </button>
        </div>
      )}

      {/* Code viewer */}
      <div
        ref={codeContainerRef}
        className="flex-1 overflow-auto bg-dv-bg p-6 font-mono text-sm"
        onMouseUp={handleCodeMouseUp}
      >
        {lines.map((line, index) => {
          const lineNumber = index + 1
          const highlightLines = currentSegment?.highlightLines ?? []
          const isHighlighted = highlightLines.includes(lineNumber)
          const isInRange = currentSegment ? (lineNumber >= currentSegment.startLine && lineNumber <= currentSegment.endLine) : false
          const isSelected = selectedLines
            ? lineNumber >= selectedLines.start && lineNumber <= selectedLines.end
            : false

          return (
            <motion.div
              key={index}
              data-line={lineNumber}
              className={clsx(
                'flex py-0.5 px-2 -mx-2 rounded-[4px] transition-colors duration-300',
                isSelected && 'bg-amber-400/12 border-l-2 border-amber-400',
                !isSelected && isHighlighted && 'bg-dv-accent/12 border-l-2 border-dv-accent',
                !isSelected && isInRange && !isHighlighted && 'bg-dv-accent/5'
              )}
              initial={false}
              animate={{
                backgroundColor: isSelected
                  ? 'rgba(251, 191, 36, 0.12)'
                  : isHighlighted
                    ? 'rgba(10, 132, 255, 0.12)'
                    : isInRange
                      ? 'rgba(10, 132, 255, 0.05)'
                      : 'transparent',
              }}
            >
              <span className="w-12 text-right pr-4 text-dv-text-muted select-none flex-shrink-0">
                {lineNumber}
              </span>
              <span className={clsx(
                'flex-1 whitespace-pre',
                isSelected ? 'text-amber-200' : isHighlighted ? 'text-dv-text' : 'text-dv-text-muted'
              )}>
                <SyntaxHighlight code={line} />
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* Transcript overlay */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            className="absolute bottom-32 left-1/2 -translate-x-1/2 max-w-2xl w-full px-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="bg-dv-surface/70 backdrop-blur-ios border border-dv-border rounded-ios-lg p-4 shadow-ios">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-dv-accent/15 flex items-center justify-center flex-shrink-0">
                  <Volume2 className="w-4 h-4 text-dv-accent" />
                </div>
                <div>
                  <p className="ios-caption2 text-dv-text-muted mb-1">
                    Segment {currentSegmentIndex + 1} of {script.segments.length}
                  </p>
                  <p className="ios-subhead text-dv-text leading-relaxed">{currentSegment?.text ?? ''}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="border-t border-dv-border bg-dv-surface/60 backdrop-blur-ios p-4">
        {/* Progress bar */}
        <div
          className="h-1.5 bg-[var(--glass-6)] rounded-full mb-4 cursor-pointer overflow-hidden"
          onClick={handleSeek}
        >
          <motion.div
            className="h-full bg-gradient-to-r from-dv-accent to-dv-purple rounded-full relative"
            initial={false}
            animate={{ width: `${totalProgress}%` }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-ios-sm transform translate-x-1/2" />
          </motion.div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Play controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSkipBack}
                className="p-2 rounded-[10px] hover:bg-[var(--glass-6)] transition-colors active:scale-[0.92]"
                disabled={currentSegmentIndex === 0}
              >
                <SkipBack className="w-5 h-5 text-dv-text-muted" />
              </button>

              <button
                onClick={() => {
                  if (!audioReady && audioLoading) return
                  onPlayingChange(!isPlaying)
                }}
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-[0.92] shadow-ios-sm',
                  audioReady
                    ? 'bg-dv-accent hover:brightness-110 cursor-pointer'
                    : 'bg-dv-accent/40 cursor-not-allowed'
                )}
                disabled={!audioReady}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={handleSkipForward}
                className="p-2 rounded-[10px] hover:bg-[var(--glass-6)] transition-colors active:scale-[0.92]"
                disabled={currentSegmentIndex === script.segments.length - 1}
              >
                <SkipForward className="w-5 h-5 text-dv-text-muted" />
              </button>
            </div>

            {/* Time display */}
            <div className="flex items-center gap-1.5 ios-caption1">
              <span className="text-dv-text font-medium">{formatTime(currentTime)}</span>
              <span className="text-dv-text-muted">/</span>
              <span className="text-dv-text-muted">{formatTime(audioDuration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Volume */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-[10px] hover:bg-[var(--glass-6)] transition-colors active:scale-[0.92]"
            >
              {isMuted ? (
                <VolumeX className="w-4.5 h-4.5 text-dv-text-muted" />
              ) : (
                <Volume2 className="w-4.5 h-4.5 text-dv-text-muted" />
              )}
            </button>

            {/* Transcript toggle */}
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={clsx(
                'p-2 rounded-[10px] transition-colors active:scale-[0.92]',
                showTranscript ? 'bg-dv-accent/10 text-dv-accent' : 'hover:bg-[var(--glass-6)] text-dv-text-muted'
              )}
            >
              <MessageSquare className="w-4.5 h-4.5" />
            </button>

            {/* Playback speed */}
            <div className="relative group">
              <button className="flex items-center gap-1 px-2.5 py-2 rounded-[10px] hover:bg-[var(--glass-6)] transition-colors">
                <Clock className="w-3.5 h-3.5 text-dv-text-muted" />
                <span className="ios-caption1 text-dv-text-muted font-medium">{playbackSpeed}x</span>
              </button>

              <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
                <div className="bg-dv-surface/80 backdrop-blur-ios border border-dv-border rounded-[12px] p-1.5 shadow-ios flex flex-col gap-0.5">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={clsx(
                        'px-3 py-1.5 rounded-[8px] ios-caption1 transition-colors',
                        playbackSpeed === speed
                          ? 'bg-dv-accent/10 text-dv-accent font-medium'
                          : 'hover:bg-[var(--glass-4)] text-dv-text-muted'
                      )}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simple syntax highlighting component using tokenization (no dangerouslySetInnerHTML)
function SyntaxHighlight({ code }: { code: string }) {
  // Single combined regex — alternation ensures each character is matched only once,
  // preventing earlier matches from being re-processed by later patterns.
  const tokenRegex =
    /(#.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b(?:def|class|return|if|else|elif|for|while|try|except|import|from|async|await|with|as|None|True|False|const|let|var|function|export|default|interface|type|enum|extends|implements|new|this|super|throw|catch|finally|switch|case|break|continue|yield|of|in|instanceof|typeof|void|delete|null|undefined|true|false)\b)|(\b\d+\.?\d*\b)|(\b[A-Z][a-zA-Z0-9_]*\b)|(\b\w+(?=\s*\())/gm

  const tokens: { text: string; className?: string }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(code)) !== null) {
    // Plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index) })
    }

    let className: string | undefined
    if (match[1]) className = 'text-dv-text-muted'   // Comments
    else if (match[2]) className = 'text-dv-success'  // Strings
    else if (match[3]) className = 'text-dv-purple'   // Keywords
    else if (match[4]) className = 'text-dv-warning'  // Numbers
    else if (match[5]) className = 'text-dv-cyan'     // PascalCase / Classes
    else if (match[6]) className = 'text-dv-accent'   // Function calls

    tokens.push({ text: match[0], className })
    lastIndex = match.index + match[0].length
  }

  // Remaining plain text
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex) })
  }

  return (
    <>
      {tokens.map((tok, i) =>
        tok.className
          ? <span key={i} className={tok.className}>{tok.text}</span>
          : <span key={i}>{tok.text}</span>
      )}
    </>
  )
}

