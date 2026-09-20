import { useEffect, useRef, useState } from 'react'
import { getChapterDraft, putMomentDraft } from '../../../api/draftFetch'
import { useAutosave } from '../../../lib/useAutosave'
import { latestOf } from './chapterDates'

// What one save sends: the moments whose text changed since they were last
// saved (with the ids they belong to, so a save that runs after switching
// chapters still lands on the right one).
interface DraftChanges { projectId: string; chapterId: string; changes: Record<string, string> }

// One chapter's draft: every moment's body loaded at once, autosaved as it is
// typed (see lib/useAutosave.ts: after a pause, and flushed on navigation,
// unmount and via flush()).
export function useChapterDraft(projectId: string | null, chapterId: string | null) {
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [reloads, setReloads] = useState(0)
  // When the newest saved moment was last written (as loaded from the server).
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const latest = useRef<Record<string, string>>({})
  // Text changed since the last successful save.
  const unsaved = useRef<Record<string, string>>({})

  const autosave = useAutosave<DraftChanges>({
    save: async ({ projectId: pid, chapterId: cid, changes }) => {
      await Promise.all(Object.entries(changes).map(([momentId, body]) => putMomentDraft(pid, cid, momentId, body)))
      // Anything typed again meanwhile is still unsaved.
      for (const [momentId, body] of Object.entries(changes)) {
        if (unsaved.current[momentId] === body) delete unsaved.current[momentId]
      }
    },
  })
  const flushRef = useRef(autosave.flush)
  flushRef.current = autosave.flush

  useEffect(() => {
    let cancelled = false
    unsaved.current = {}
    setBodies({})
    setLoadedAt(null)
    latest.current = {}
    if (!projectId || !chapterId) { setStatus('idle'); return }
    setStatus('loading')
    setLoadError(undefined)
    getChapterDraft(projectId, chapterId)
      .then(draft => {
        if (cancelled) return
        const next = Object.fromEntries(Object.entries(draft.moments).map(([id, m]) => [id, m.body]))
        latest.current = next
        setBodies(next)
        setLoadedAt(latestOf(Object.values(draft.moments).map(m => m.updatedAt)))
        setStatus('idle')
      })
      .catch(err => {
        if (cancelled) return
        setStatus('error')
        setLoadError(err instanceof Error ? err.message : 'Failed to load the draft')
      })
    return () => {
      cancelled = true
      // Leaving this chapter: save what was typed (the value already carries
      // this chapter's ids).
      void flushRef.current()
    }
  }, [projectId, chapterId, reloads])

  function setBody(momentId: string, body: string) {
    if (!projectId || !chapterId) return
    latest.current = { ...latest.current, [momentId]: body }
    unsaved.current = { ...unsaved.current, [momentId]: body }
    setBodies(latest.current)
    autosave.schedule({ projectId, chapterId, changes: { ...unsaved.current } })
  }

  // Throw away the text typed since the last save and load the saved draft again.
  async function restore() {
    await autosave.discard()
    unsaved.current = {}
    setReloads(n => n + 1)
  }

  return {
    bodies, status, setBody, restore,
    error: loadError ?? autosave.error,
    saving: autosave.saving,
    dirty: autosave.dirty,
    saveError: autosave.error,
    lastSavedAt: autosave.lastSavedAt,
    // The newest draft save in the chapter (ISO), including saves made in this session.
    editedAt: latestOf([loadedAt, autosave.lastSavedAt === null ? null : new Date(autosave.lastSavedAt).toISOString()]),
    flush: autosave.flush,
    saveNow: autosave.flush,
  }
}
