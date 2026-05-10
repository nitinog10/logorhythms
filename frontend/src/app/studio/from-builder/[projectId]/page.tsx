'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { studio } from '@/lib/api'

export default function FromBuilderRedirect() {
  const params = useParams()
  const router = useRouter()
  const projectId = String(params?.projectId || '')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    ;(async () => {
      try {
        // Look for an existing Studio session that already wraps this builder project.
        const list = await studio.listSessions().catch(() => ({ sessions: [], total: 0 }))
        const existing = list.sessions.find(
          (s) => s.kind === 'generated' && (s as any).source_id === projectId
        )
        if (cancelled) return
        if (existing) {
          router.replace(`/studio/${existing.id}`)
          return
        }
        const created = await studio.createSession({
          kind: 'generated',
          source_id: projectId,
        })
        if (!cancelled) router.replace(`/studio/${created.id}`)
      } catch {
        if (!cancelled) router.replace('/studio')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--text-secondary)]">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Opening project in Studio...
      </div>
    </div>
  )
}
