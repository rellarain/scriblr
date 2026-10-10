import { useEffect, useRef, useState } from 'react'
import { getChapterDraft, putMomentDraft } from '../../../api/draftFetch'
import { getRevisionSnapshot, listRevisionSummaries } from '../../../api/historyFetch'
import { newestFirst, nextSnapshot, type LogEntry } from '../../../lib/logUndo'
import { useAutosave } from '../../../lib/useAutosave'
import { useUndoHistory } from '../../../lib/useUndoHistory'
import { latestOf } from './chapterDates'

// What one save sends: the moments whose text changed since they were last
// saved (with the ids they belong to, so a save that runs after switching
// chapters still lands on the right one).
interface DraftChanges { projectId: string; chapterId: string; changes: Record<string, string> }

// One chapter's draft: every moment's body loaded at once, autosaved as it is
// typed (see lib/useAutosave.ts: after a pause, and flushed on navigation,
// unmount and via flush()). Undo and Redo step through the moments' text as it is committed (a burst of typing is one step); once that is
// used up, Undo goes on into the chapter's revisions logged today (one per editing session).
export function useChapterDraft(projectId: string | null, chapterId: string | null) {
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
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
  const history = useUndoHistory<Record<string, string>>()
  useEffect(() => { history.markSaved() }, [autosave.lastSavedAt])
  // Today's revisions of this chapter (newest first) and how far Undo has gone into them.
  const [log, setLog] = useState<LogEntry[]>([])
  const cursor = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId || !chapterId) { setLog([]); return }
    let cancelled = false
    listRevisionSummaries(projectId, chapterId)
      .then(list => { if (!cancelled) setLog(newestFirst(list.map(r => ({ id: r.snapshotId, createdAt: r.createdAt })))) })
      .catch(() => { /* the log is a convenience */ })
    return () => { cancelled = true }
  }, [projectId, chapterId, autosave.lastSavedAt])
  useEffect(() => { cursor.current = null }, [projectId, chapterId])

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
        history.reset(next)
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
  }, [projectId, chapterId])

  function setBody(momentId: string, body: string) {
    if (!projectId || !chapterId) return
    latest.current = { ...latest.current, [momentId]: body }
    unsaved.current = { ...unsaved.current, [momentId]: body }
    setBodies(latest.current)
    history.record(latest.current, { text: true })
    autosave.schedule({ projectId, chapterId, changes: { ...unsaved.current } })
  }

  // Show an earlier or later text as an unsaved change: the moments that differ are saved like typed text.
  function show(target: Record<string, string> | undefined) {
    if (!target || !projectId || !chapterId) return
    const changes: Record<string, string> = {}
    for (const id of new Set([...Object.keys(latest.current), ...Object.keys(target)])) {
      const before = latest.current[id] ?? ''
      const after = target[id] ?? ''
      if (before !== after) changes[id] = after
    }
    latest.current = target
    unsaved.current = { ...unsaved.current, ...changes }
    setBodies(target)
    autosave.schedule({ projectId, chapterId, changes: { ...unsaved.current } })
  }
  // Go back into today's revisions: the next older text that is not the one shown, as an unsaved change (and redoable).
  async function logUndo() {
    if (!projectId || !chapterId) return
    let at = cursor.current
    for (let guard = 0; guard < 25; guard += 1) {
      const target = nextSnapshot(log, at)
      if (!target) break
      at = target.id
      let moments: Record<string, string>
      try { moments = (await getRevisionSnapshot(projectId, chapterId, target.id)).moments } catch { break }
      const ids = new Set([...Object.keys(latest.current), ...Object.keys(moments)])
      if ([...ids].every(id => (latest.current[id] ?? '') === (moments[id] ?? ''))) continue
      cursor.current = at
      history.stepBack(moments)
      show(moments)
      return
    }
    cursor.current = at
  }
  const undo = () => { if (history.canUndo) show(history.undo()); else void logUndo() }
  const redo = () => show(history.redo())

  return {
    bodies, status, setBody, undo, redo, canUndo: history.canUndo || nextSnapshot(log, cursor.current) !== null, canRedo: history.canRedo,
    nextSaveAt: autosave.nextSaveAt, wait: autosave.wait,
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
