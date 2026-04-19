'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ChevronRight, ChevronDown, Folder, FolderOpen, FileCode,
  Layers, Zap, BookOpen, ArrowLeft, Clock, MessageSquare,
  Sparkles, ArrowRight,
} from 'lucide-react'
import { clsx } from 'clsx'

// ─── Mock Data ──────────────────────────────────────────────────────────────

const DEMO_CODE = `import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "your-256-bit-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = 30  # minutes


class AuthService:
    """Handles JWT authentication, password hashing,
    and user session management."""

    def __init__(self, db_session):
        self.db = db_session
        self.blacklisted_tokens: set = set()

    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)

    def verify_password(self, plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

    def create_access_token(
        self, user_id: str, extra: dict = {}
    ) -> str:
        expire = datetime.utcnow() + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE
        )
        payload = {
            "sub": user_id,
            "exp": expire,
            "iat": datetime.utcnow(),
            **extra,
        }
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    async def verify_token(self, token: str) -> dict:
        if token in self.blacklisted_tokens:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )
        try:
            payload = jwt.decode(
                token, SECRET_KEY, algorithms=[ALGORITHM]
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        user = await self.db.users.find_one(
            {"_id": payload["sub"]}
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return user

    def revoke_token(self, token: str) -> None:
        self.blacklisted_tokens.add(token)

    async def authenticate_user(
        self, email: str, password: str
    ) -> Optional[dict]:
        user = await self.db.users.find_one({"email": email})
        if not user:
            return None
        if not self.verify_password(password, user["password_hash"]):
            return None
        return user`

const DEMO_SEGMENTS = [
  {
    id: 's1', order: 0,
    text: "Let's walk through the authentication service. At the top, we import JWT for token handling, datetime for expiration logic, and FastAPI's HTTP exception class for clean error responses.",
    startLine: 1, endLine: 5, highlightLines: [1, 2, 3, 4, 5], durationEstimate: 8,
  },
  {
    id: 's2', order: 1,
    text: "Next, the password context is set up using bcrypt — a battle-tested hashing algorithm. The secret key and algorithm constants are defined here. In production, you'd pull these from environment variables instead of hardcoding them.",
    startLine: 7, endLine: 10, highlightLines: [7, 8, 9, 10], durationEstimate: 10,
  },
  {
    id: 's3', order: 2,
    text: "The AuthService class is the core of this module. It takes a database session in the constructor, and maintains a set of blacklisted tokens for revocation — a simple but effective approach for invalidating sessions.",
    startLine: 13, endLine: 20, highlightLines: [13, 14, 15, 17, 18, 19, 20], durationEstimate: 10,
  },
  {
    id: 's4', order: 3,
    text: "Password hashing and verification are handled by two clean methods. The hash_password method creates a bcrypt hash, and verify_password checks a plain text input against the stored hash. These never store raw passwords.",
    startLine: 22, endLine: 26, highlightLines: [22, 23, 25, 26], durationEstimate: 9,
  },
  {
    id: 's5', order: 4,
    text: "The create_access_token method builds a JWT with the user ID as the subject claim, an expiration time set to 30 minutes from now, and the issued-at timestamp. Any extra claims can be merged in via the extra parameter.",
    startLine: 28, endLine: 39, highlightLines: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], durationEstimate: 11,
  },
  {
    id: 's6', order: 5,
    text: "Token verification is the most critical method. First it checks the blacklist. Then it decodes the JWT, catching expired and invalid token errors separately — this gives the frontend clear error messages to act on.",
    startLine: 41, endLine: 60, highlightLines: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60], durationEstimate: 12,
  },
  {
    id: 's7', order: 6,
    text: "After decoding, it looks up the user in the database by their ID. If the user no longer exists — maybe their account was deleted — it raises a 404. Otherwise, the full user object is returned to the caller.",
    startLine: 61, endLine: 70, highlightLines: [61, 62, 63, 64, 65, 66, 67, 68, 69, 70], durationEstimate: 9,
  },
  {
    id: 's8', order: 7,
    text: "The revoke_token method simply adds the token to the blacklist set. This is an in-memory approach — for production, you'd want Redis or a database-backed blacklist that persists across server restarts.",
    startLine: 72, endLine: 73, highlightLines: [72, 73], durationEstimate: 8,
  },
  {
    id: 's9', order: 8,
    text: "Finally, authenticate_user ties it all together. It looks up the user by email, verifies the password hash, and returns the user on success or None on failure. The caller then creates a token using create_access_token.",
    startLine: 75, endLine: 83, highlightLines: [75, 76, 77, 78, 79, 80, 81, 82, 83], durationEstimate: 10,
  },
]

const DEMO_FILE_TREE = [
  {
    id: 'src', name: 'src', isDir: true, children: [
      {
        id: 'src/auth', name: 'auth', isDir: true, children: [
          { id: 'src/auth/auth_service.py', name: 'auth_service.py', isDir: false, lang: 'python' },
          { id: 'src/auth/middleware.py', name: 'middleware.py', isDir: false, lang: 'python' },
          { id: 'src/auth/permissions.py', name: 'permissions.py', isDir: false, lang: 'python' },
        ]
      },
      {
        id: 'src/models', name: 'models', isDir: true, children: [
          { id: 'src/models/user.py', name: 'user.py', isDir: false, lang: 'python' },
          { id: 'src/models/session.py', name: 'session.py', isDir: false, lang: 'python' },
        ]
      },
      {
        id: 'src/routes', name: 'routes', isDir: true, children: [
          { id: 'src/routes/auth_routes.py', name: 'auth_routes.py', isDir: false, lang: 'python' },
          { id: 'src/routes/user_routes.py', name: 'user_routes.py', isDir: false, lang: 'python' },
        ]
      },
      { id: 'src/main.py', name: 'main.py', isDir: false, lang: 'python' },
      { id: 'src/config.py', name: 'config.py', isDir: false, lang: 'python' },
    ]
  },
  {
    id: 'tests', name: 'tests', isDir: true, children: [
      { id: 'tests/test_auth.py', name: 'test_auth.py', isDir: false, lang: 'python' },
      { id: 'tests/test_routes.py', name: 'test_routes.py', isDir: false, lang: 'python' },
    ]
  },
  { id: 'requirements.txt', name: 'requirements.txt', isDir: false, lang: 'text' },
  { id: 'README.md', name: 'README.md', isDir: false, lang: 'markdown' },
]

const DEMO_DIAGRAM = `graph TD
  A[Client Request] -->|"Authorization: Bearer token"| B[AuthMiddleware]
  B --> C{Token Valid?}
  C -->|Yes| D[verify_token]
  D --> E{User Exists?}
  E -->|Yes| F[Route Handler]
  E -->|No| G[404 Not Found]
  C -->|No / Expired| H[401 Unauthorized]
  C -->|Blacklisted| H

  I[Login Request] -->|email + password| J[authenticate_user]
  J --> K{Credentials OK?}
  K -->|Yes| L[create_access_token]
  L --> M[Return JWT]
  K -->|No| N[Return None / 401]

  O[Logout Request] --> P[revoke_token]
  P --> Q[Add to Blacklist Set]

  style A fill:#1a1a2e,stroke:#0a84ff,color:#fff
  style F fill:#1a1a2e,stroke:#30d158,color:#fff
  style H fill:#1a1a2e,stroke:#ff453a,color:#fff
  style M fill:#1a1a2e,stroke:#30d158,color:#fff
  style L fill:#1a1a2e,stroke:#bf5af2,color:#fff`

const DEMO_IMPACT = {
  riskLevel: 'high' as const,
  riskScore: 8.2,
  directDependents: ['middleware.py', 'auth_routes.py', 'user_routes.py'],
  totalAffected: 7,
  notes: [
    'Changing the SECRET_KEY will invalidate all existing tokens immediately',
    'The in-memory blacklist is lost on server restart — consider Redis',
    'Password hashing changes will break existing user logins',
    'Token expiration change affects all active sessions',
  ],
}

const DEMO_DOCS = `## Module Overview

The authentication service is the security backbone of the application. It handles JWT token creation and verification, password hashing with bcrypt, and session management through token blacklisting.

## Dependencies

- **jwt** (PyJWT) — Encoding and decoding JSON Web Tokens
- **passlib** — Secure password hashing with bcrypt
- **FastAPI** — HTTP exception classes for clean error handling
- **datetime** — Token expiration calculations

## Key Functions

| Function | Purpose |
|----------|---------|
| \`hash_password\` | Creates a bcrypt hash of the raw password |
| \`verify_password\` | Compares plain text against stored hash |
| \`create_access_token\` | Builds a signed JWT with expiration |
| \`verify_token\` | Decodes JWT, checks blacklist and user existence |
| \`authenticate_user\` | Full login flow: lookup → verify → return user |

## Notes

The blacklist is currently in-memory. For production deployments with multiple workers, switch to a Redis-backed set. The secret key should come from environment variables, not hardcoded strings.`

// ─── Helpers ────────────────────────────────────────────────────────────────

const appleEase = [0.25, 0.1, 0.25, 1] as const

// Simple keyword-based Python syntax highlighting
function SyntaxLine({ code }: { code: string }) {
  const tokenRegex =
    /(#.*)|(""".*?"""|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(import|from|class|def|return|if|else|elif|for|while|try|except|raise|async|await|with|as|None|True|False|not|and|or|in|is|self)\b|(\b\d+\.?\d*\b)|(\b[A-Z][a-zA-Z0-9_]*\b)|(\b\w+(?=\s*\())/gm

  const tokens: { text: string; cls?: string }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) tokens.push({ text: code.slice(lastIndex, match.index) })
    let cls: string | undefined
    if (match[1]) cls = 'text-[#636366]'
    else if (match[2]) cls = 'text-[#30d158]'
    else if (match[3]) cls = 'text-[#bf5af2]'
    else if (match[4]) cls = 'text-[#ff9f0a]'
    else if (match[5]) cls = 'text-[#64d2ff]'
    else if (match[6]) cls = 'text-[#0a84ff]'
    tokens.push({ text: match[0], cls })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < code.length) tokens.push({ text: code.slice(lastIndex) })

  return <>{tokens.map((t, i) => t.cls ? <span key={i} className={t.cls}>{t.text}</span> : <span key={i}>{t.text}</span>)}</>
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DemoPage() {
  // State
  const [currentSegment, setCurrentSegment] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [rightPanel, setRightPanel] = useState<'diagram' | 'impact' | 'docs'>('diagram')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/auth']))
  const [selectedFile] = useState('src/auth/auth_service.py')

  // Refs
  const codeRef = useRef<HTMLDivElement>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const isPlayingRef = useRef(isPlaying)

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const seg = DEMO_SEGMENTS[currentSegment]
  const lines = DEMO_CODE.split('\n')
  const totalDuration = DEMO_SEGMENTS.reduce((s, seg) => s + seg.durationEstimate, 0)

  // ── Auto-scroll code ───────────────────────────────────────────────────
  useEffect(() => {
    if (codeRef.current && seg) {
      const lineHeight = 26
      const target = (seg.startLine - 4) * lineHeight
      codeRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
  }, [currentSegment, seg])

  // ── TTS playback ───────────────────────────────────────────────────────
  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
  }, [])

  const speakSegment = useCallback((index: number) => {
    stopSpeech()
    const s = DEMO_SEGMENTS[index]
    if (!s || isMuted) return

    const utter = new SpeechSynthesisUtterance(s.text)
    utter.rate = playbackSpeed
    utter.pitch = 1
    utter.volume = 1

    // Try to use a natural-sounding voice
    const voices = window.speechSynthesis?.getVoices() || []
    const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    if (preferred) utter.voice = preferred

    utter.onend = () => {
      if (!isPlayingRef.current) return
      if (index < DEMO_SEGMENTS.length - 1) {
        setTimeout(() => {
          if (isPlayingRef.current) {
            setCurrentSegment(index + 1)
            speakSegment(index + 1)
          }
        }, 600)
      } else {
        setIsPlaying(false)
      }
    }

    utteranceRef.current = utter
    window.speechSynthesis?.speak(utter)
  }, [isMuted, playbackSpeed, stopSpeech])

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      stopSpeech()
    } else {
      setIsPlaying(true)
      speakSegment(currentSegment)
    }
  }, [isPlaying, currentSegment, speakSegment, stopSpeech])

  const handleSkipBack = useCallback(() => {
    if (currentSegment > 0) {
      stopSpeech()
      const prev = currentSegment - 1
      setCurrentSegment(prev)
      if (isPlaying) speakSegment(prev)
    }
  }, [currentSegment, isPlaying, speakSegment, stopSpeech])

  const handleSkipForward = useCallback(() => {
    if (currentSegment < DEMO_SEGMENTS.length - 1) {
      stopSpeech()
      const next = currentSegment + 1
      setCurrentSegment(next)
      if (isPlaying) speakSegment(next)
    }
  }, [currentSegment, isPlaying, speakSegment, stopSpeech])

  // Progress calculation
  useEffect(() => {
    const completed = DEMO_SEGMENTS.slice(0, currentSegment).reduce((s, seg) => s + seg.durationEstimate, 0)
    setProgress(totalDuration > 0 ? (completed / totalDuration) * 100 : 0)
  }, [currentSegment, totalDuration])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const currentTime = DEMO_SEGMENTS.slice(0, currentSegment).reduce((s, seg) => s + seg.durationEstimate, 0)

  // Toggle folder
  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="h-screen flex flex-col bg-dv-bg text-dv-text overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-12 bg-[var(--bar-bg)] backdrop-blur-2xl border-b border-dv-border flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="DocuVerse" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">DocuVerse</span>
          </Link>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-dv-accent/10 text-dv-accent border border-dv-accent/20">DEMO</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-dv-text/30 hidden sm:block">Like what you see?</span>
          <Link
            href="/auth/signin"
            className="flex items-center gap-1.5 text-[12px] font-medium bg-[var(--glass-10)] border border-dv-border text-dv-text px-4 py-1.5 rounded-full hover:bg-[var(--glass-16)] transition-all"
          >
            Sign up free
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* ── Main Layout ─────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: File Explorer ─────────────────────── */}
        <div className="w-[240px] border-r border-dv-border bg-[var(--glass-2)] flex-shrink-0 overflow-y-auto hidden md:block">
          <div className="px-3 py-3 border-b border-dv-border-subtle">
            <div className="text-[11px] font-semibold text-dv-text/25 uppercase tracking-[0.06em]">Explorer</div>
            <div className="text-[12px] text-dv-accent/70 mt-1 truncate">sample-auth-app</div>
          </div>
          <div className="p-1.5">
            {DEMO_FILE_TREE.map(node => (
              <FileNode key={node.id} node={node} depth={0} expanded={expandedFolders} onToggle={toggleFolder} selected={selectedFile} />
            ))}
          </div>
        </div>

        {/* ── Center: Code Viewer ─────────────────────── */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {/* File tab */}
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--glass-3)] border-b border-dv-border-subtle flex-shrink-0">
            <span className="text-[13px]">🐍</span>
            <span className="text-[12px] font-medium text-dv-text/60">auth_service.py</span>
            <span className="text-[11px] text-dv-text/20 ml-1">{lines.length} lines</span>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-dv-accent bg-dv-accent/10 px-2.5 py-1 rounded-full">
              <Volume2 className="w-3 h-3" />
              WALKTHROUGH
            </div>
          </div>

          {/* Code */}
          <div ref={codeRef} className="flex-1 overflow-auto font-mono text-[13px] leading-[26px] p-4">
            {lines.map((line, i) => {
              const lineNum = i + 1
              const isHighlighted = seg?.highlightLines.includes(lineNum)
              const inRange = seg ? lineNum >= seg.startLine && lineNum <= seg.endLine : false
              return (
                <div
                  key={i}
                  className={clsx(
                    'flex px-2 -mx-2 rounded transition-colors duration-300',
                    isHighlighted && 'bg-dv-accent/[0.1] border-l-2 border-dv-accent',
                    inRange && !isHighlighted && 'bg-dv-accent/[0.04]',
                    !inRange && !isHighlighted && 'border-l-2 border-transparent',
                  )}
                >
                  <span className="w-10 text-right pr-4 text-dv-text/15 select-none flex-shrink-0">{lineNum}</span>
                  <span className={clsx('flex-1 whitespace-pre', isHighlighted ? 'text-dv-text' : 'text-dv-text/50')}>
                    <SyntaxLine code={line} />
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Transcript overlay ─────────────────────── */}
          <AnimatePresence>
            {showTranscript && (
              <motion.div
                className="absolute bottom-36 left-1/2 -translate-x-1/2 max-w-xl w-full px-6 z-10"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
              >
                <div className="bg-dv-surface/70 backdrop-blur-xl border border-dv-border rounded-2xl p-4 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-dv-accent/15 flex items-center justify-center flex-shrink-0">
                      <Volume2 className="w-4 h-4 text-dv-accent" />
                    </div>
                    <div>
                      <p className="text-[11px] text-dv-text/30 mb-1">
                        Segment {currentSegment + 1} of {DEMO_SEGMENTS.length}
                      </p>
                      <p className="text-[13px] text-dv-text/80 leading-relaxed">{seg?.text}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Controls ─────────────────────────────────── */}
          <div className="border-t border-dv-border bg-[var(--glass-3)] backdrop-blur-xl p-4 flex-shrink-0">
            {/* Progress bar */}
            <div className="h-1.5 bg-[var(--glass-6)] rounded-full mb-4 cursor-pointer overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                const idx = Math.min(Math.floor(pct * DEMO_SEGMENTS.length), DEMO_SEGMENTS.length - 1)
                stopSpeech()
                setCurrentSegment(idx)
                if (isPlaying) speakSegment(idx)
              }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-dv-accent to-dv-purple rounded-full relative"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md transform translate-x-1/2" />
              </motion.div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <button onClick={handleSkipBack} disabled={currentSegment === 0}
                    className="p-2 rounded-xl hover:bg-[var(--glass-6)] transition-colors disabled:opacity-20">
                    <SkipBack className="w-5 h-5 text-dv-text/50" />
                  </button>
                  <button onClick={handlePlayPause}
                    className="w-12 h-12 rounded-full bg-dv-accent flex items-center justify-center hover:brightness-110 transition-all active:scale-95 shadow-lg">
                    {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
                  </button>
                  <button onClick={handleSkipForward} disabled={currentSegment === DEMO_SEGMENTS.length - 1}
                    className="p-2 rounded-xl hover:bg-[var(--glass-6)] transition-colors disabled:opacity-20">
                    <SkipForward className="w-5 h-5 text-dv-text/50" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span className="text-dv-text/60 font-medium tabular-nums">{formatTime(currentTime)}</span>
                  <span className="text-dv-text/20">/</span>
                  <span className="text-dv-text/30 tabular-nums">{formatTime(totalDuration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => { setIsMuted(!isMuted); if (!isMuted) stopSpeech() }}
                  className="p-2 rounded-xl hover:bg-[var(--glass-6)] transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4 text-dv-text/30" /> : <Volume2 className="w-4 h-4 text-dv-text/30" />}
                </button>
                <button onClick={() => setShowTranscript(!showTranscript)}
                  className={clsx('p-2 rounded-xl transition-colors', showTranscript ? 'bg-dv-accent/10 text-dv-accent' : 'hover:bg-[var(--glass-6)] text-dv-text/30')}>
                  <MessageSquare className="w-4 h-4" />
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-1 px-2.5 py-2 rounded-xl hover:bg-[var(--glass-6)] transition-colors">
                    <Clock className="w-3.5 h-3.5 text-dv-text/30" />
                    <span className="text-[12px] text-dv-text/30 font-medium">{playbackSpeed}x</span>
                  </button>
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
                    <div className="bg-dv-surface/90 backdrop-blur-xl border border-dv-border rounded-xl p-1.5 shadow-lg flex flex-col gap-0.5">
                      {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                        <button key={speed} onClick={() => setPlaybackSpeed(speed)}
                          className={clsx('px-3 py-1.5 rounded-lg text-[12px] transition-colors',
                            playbackSpeed === speed ? 'bg-dv-accent/10 text-dv-accent font-medium' : 'hover:bg-[var(--glass-4)] text-dv-text/40')}>
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

        {/* ── Right: Panel Tabs ───────────────────────── */}
        <div className="w-[320px] border-l border-dv-border bg-[var(--glass-2)] flex-shrink-0 flex flex-col hidden lg:flex">
          {/* Tab bar */}
          <div className="flex border-b border-dv-border-subtle flex-shrink-0">
            {([
              { key: 'diagram' as const, icon: <Layers className="w-3.5 h-3.5" />, label: 'Diagram' },
              { key: 'impact' as const, icon: <Zap className="w-3.5 h-3.5" />, label: 'Impact' },
              { key: 'docs' as const, icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Docs' },
            ]).map(tab => (
              <button key={tab.key}
                onClick={() => setRightPanel(tab.key)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium transition-all border-b-2',
                  rightPanel === tab.key
                    ? 'text-dv-accent border-dv-accent'
                    : 'text-dv-text/30 border-transparent hover:text-dv-text/50'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {rightPanel === 'diagram' && <DiagramView />}
            {rightPanel === 'impact' && <ImpactView />}
            {rightPanel === 'docs' && <DocsView />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FileNode({ node, depth, expanded, onToggle, selected }: {
  node: any; depth: number; expanded: Set<string>; onToggle: (id: string) => void; selected: string
}) {
  const indent = depth * 14 + 8
  const isExpanded = expanded.has(node.id)
  const isSelected = selected === node.id

  if (node.isDir) {
    return (
      <div>
        <button onClick={() => onToggle(node.id)}
          className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--glass-4)] transition-all text-left"
          style={{ paddingLeft: indent }}>
          <motion.div initial={false} animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.1 }}>
            <ChevronRight className="w-3 h-3 text-dv-text/30" />
          </motion.div>
          {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-dv-accent" /> : <Folder className="w-3.5 h-3.5 text-dv-accent" />}
          <span className="text-[12px] text-dv-text/60">{node.name}</span>
        </button>
        <AnimatePresence initial={false}>
          {isExpanded && node.children && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              {node.children.map((c: any) => <FileNode key={c.id} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} selected={selected} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const langIcons: Record<string, string> = { python: '🐍', javascript: '📜', typescript: '💎', text: '📄', markdown: '📝' }

  return (
    <button className={clsx(
      'w-full flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all text-left',
      isSelected ? 'bg-dv-accent/10 text-dv-accent' : 'hover:bg-[var(--glass-4)]',
    )} style={{ paddingLeft: indent + 18 }}>
      <span className="text-[12px]">{langIcons[node.lang] || '📄'}</span>
      <span className="text-[12px] truncate">{node.name}</span>
    </button>
  )
}

function DiagramView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderCountRef = useRef(0)
  const [isRendered, setIsRendered] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    renderMermaid()
  }, [])

  const renderMermaid = async () => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    try {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'linear',
        },
        themeVariables: {
          primaryColor: '#6366f1',
          primaryTextColor: '#e4e4e7',
          primaryBorderColor: '#27272a',
          lineColor: '#52525b',
          secondaryColor: '#18181b',
          tertiaryColor: '#0f0f11',
          background: '#09090b',
          mainBkg: '#18181b',
          nodeBorder: '#27272a',
          clusterBkg: '#18181b',
          titleColor: '#e4e4e7',
          edgeLabelBackground: '#18181b',
        },
      })

      renderCountRef.current += 1
      const diagramId = `demo-diagram-${renderCountRef.current}`
      const { svg } = await mermaid.render(diagramId, DEMO_DIAGRAM)

      if (containerRef.current) {
        containerRef.current.innerHTML = svg
        // Style the SVG to fit nicely
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
          svgEl.style.borderRadius = '12px'
        }
        setIsRendered(true)
      }
    } catch (err) {
      console.error('Mermaid render failed:', err)
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div style="text-align:center;padding:24px;opacity:0.4;font-size:12px;">Could not render diagram</div>`
      }
    }
  }

  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-3">Architecture Diagram</h3>
      <p className="text-[11px] text-dv-text/30 mb-4">Auto-generated from code analysis</p>
      <div className="bg-[var(--glass-4)] border border-dv-border rounded-xl p-3 overflow-auto">
        {!isRendered && (
          <div className="flex items-center justify-center py-12 gap-2 text-dv-text/30 text-[12px]">
            <Layers className="w-4 h-4 animate-pulse" />
            Rendering diagram...
          </div>
        )}
        <div
          ref={containerRef}
          className="min-h-[200px] flex items-start justify-center [&>svg]:max-w-full"
        />
      </div>
      <p className="text-[11px] text-dv-text/20 mt-3 text-center">
        Mermaid.js · AI-generated from code analysis
      </p>
    </div>
  )
}

function ImpactView() {
  const riskColors = { low: '#30d158', medium: '#ff9f0a', high: '#ff453a' }
  const color = riskColors[DEMO_IMPACT.riskLevel]

  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-3">Impact Analysis</h3>
      <p className="text-[11px] text-dv-text/30 mb-4">What breaks if you change this file</p>

      {/* Risk score */}
      <div className="bg-[var(--glass-4)] border border-dv-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-dv-text/30 uppercase tracking-wider font-medium">Risk Score</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}18` }}>
            {DEMO_IMPACT.riskLevel.toUpperCase()}
          </span>
        </div>
        <div className="text-[28px] font-bold tabular-nums" style={{ color }}>{DEMO_IMPACT.riskScore}</div>
        <div className="text-[11px] text-dv-text/20 mt-1">{DEMO_IMPACT.totalAffected} files affected across the codebase</div>
      </div>

      {/* Dependents */}
      <div className="mb-4">
        <h4 className="text-[11px] font-semibold text-dv-text/40 uppercase tracking-wider mb-2">Direct Dependents</h4>
        {DEMO_IMPACT.directDependents.map(dep => (
          <div key={dep} className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-[var(--glass-4)] transition-colors">
            <FileCode className="w-3.5 h-3.5 text-dv-text/20" />
            <span className="text-[12px] text-dv-text/50">{dep}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div>
        <h4 className="text-[11px] font-semibold text-dv-text/40 uppercase tracking-wider mb-2">Key Risks</h4>
        {DEMO_IMPACT.notes.map((note, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <span className="text-[10px] mt-0.5" style={{ color }}>●</span>
            <span className="text-[12px] text-dv-text/40 leading-relaxed">{note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DocsView() {
  const sections = DEMO_DOCS.split('\n## ').map((block, i) => {
    if (i === 0) return null
    const [title, ...rest] = block.split('\n')
    return { title, content: rest.join('\n').trim() }
  }).filter(Boolean) as { title: string; content: string }[]

  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-3">Documentation</h3>
      <p className="text-[11px] text-dv-text/30 mb-4">AI-generated from code analysis</p>

      {sections.map((sec, i) => (
        <div key={i} className="mb-5">
          <h4 className="text-[12px] font-semibold text-dv-text/60 mb-2">{sec.title}</h4>
          <div className="text-[12px] text-dv-text/40 leading-relaxed space-y-1.5">
            {sec.content.split('\n').map((line, j) => {
              if (!line.trim()) return null
              if (line.startsWith('|')) {
                return (
                  <div key={j} className="font-mono text-[11px] text-dv-text/30 bg-[var(--glass-4)] px-2 py-0.5 rounded">
                    {line}
                  </div>
                )
              }
              if (line.startsWith('- ')) {
                return (
                  <div key={j} className="flex items-start gap-1.5 ml-1">
                    <span className="text-dv-accent/40 mt-0.5">•</span>
                    <span>{renderInline(line.slice(2))}</span>
                  </div>
                )
              }
              return <p key={j}>{renderInline(line)}</p>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="bg-[var(--glass-6)] px-1 py-0.5 rounded text-[11px] text-dv-accent">{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="text-dv-text/60 font-semibold">{p.slice(2, -2)}</strong>
    return <span key={i}>{p}</span>
  })
}
