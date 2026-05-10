'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { studio } from '@/lib/api'

export default function FromRepoRedirect() {
  const params = useParams()
  const router = useRouter()
  const repoId = String(params?.id || '')

  useEffect(() => {
    if (!repoId) return
    let cancelled = false

    ;(async () => {
      try {
        const list = await studio.listSessions().catch(() => ({ sessions: [], total: 0 }))
        const existing = list.sessions.find(
          (s) => s.kind === 'imported' && (s as any).source_id === repoId
        )
        if (cancelled) return
        if (existing) {
          router.replace(`/studio/${existing.id}`)
          return
        }
        const created = await studio.createSession({
          kind: 'imported',
          source_id: repoId,
        })
        if (!cancelled) router.replace(`/studio/${created.id}`)
      } catch {
        if (!cancelled) router.replace('/studio')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [repoId, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--text-secondary)]">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Opening repository in Studio...
      </div>
    </div>
  )
}
