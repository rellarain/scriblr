import { useEffect, useRef, useState } from 'react'
import { getChapterDraft, putMomentDraft } from '../../../api/draftFetch'

const DEBOUNCE_MS = 800

// One chapter's draft: every moment's body loaded at once, with a debounced
// save per moment as it is typed.
export function useChapterDraft(projectId: string | null, chapterId: string | null) {
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const latest = useRef<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    timers.current.forEach(t => clearTimeout(t))
    timers.current.clear()
    setBodies({})
    latest.current = {}
    if (!projectId || !chapterId) { setStatus('idle'); return }
    setStatus('loading')
    setError(undefined)
    getChapterDraft(projectId, chapterId)
      .then(draft => {
        if (cancelled) return
        const next = Object.fromEntries(Object.entries(draft.moments).map(([id, m]) => [id, m.body]))
        latest.current = next
        setBodies(next)
        setStatus('idle')
      })
      .catch(err => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to load the draft')
      })
    return () => { cancelled = true }
  }, [projectId, chapterId])

  // Flush pending saves when leaving the chapter/project.
  useEffect(() => () => {
    // projectId/chapterId here are this effect's own (the ones being left).
    timers.current.forEach((t, momentId) => {
      clearTimeout(t)
      if (projectId && chapterId) void putMomentDraft(projectId, chapterId, momentId, latest.current[momentId] ?? '')
    })
    timers.current.clear()
  }, [projectId, chapterId])

  function setBody(momentId: string, body: string) {
    if (!projectId || !chapterId) return
    latest.current = { ...latest.current, [momentId]: body }
    setBodies(latest.current)
    const pending = timers.current.get(momentId)
    if (pending) clearTimeout(pending)
    timers.current.set(momentId, setTimeout(async () => {
      timers.current.delete(momentId)
      setSaving(true)
      try {
        await putMomentDraft(projectId, chapterId, momentId, latest.current[momentId] ?? '')
        setError(undefined)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save the draft')
      } finally {
        setSaving(false)
      }
    }, DEBOUNCE_MS))
  }

  return { bodies, status, error, saving, setBody }
}
