import { useEffect, useRef, useState } from 'react'
import { useDraft, useSaveDraft } from '../../api/draft'

const AUTOSAVE_DELAY_MS = 1500

// Debounced-autosave state machine for one moment's draft body, extracted
// from MomentEditor so other surfaces (e.g. a future continuous chapter-page
// editor) can reuse the same per-moment save/dirty/flush-on-unmount logic
// without duplicating it.
export function useAutosaveDraft(projectId: string, chapterId: string, momentId: string) {
  const { data, isLoading } = useDraft(projectId, chapterId, momentId)
  const saveDraft = useSaveDraft(projectId, chapterId, momentId)

  const [body, setBodyState] = useState('')
  const bodyRef = useRef('')
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const saveDraftRef = useRef(saveDraft)

  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    if (data) {
      setBodyState(data.body)
      bodyRef.current = data.body
      setDirty(false)
    }
  }, [data])

  // Flush any unsaved edit if this moment is closed (switched away from, or
  // navigated off) before the debounce timer fires -- otherwise a fast
  // moment-switch silently drops the pending change.
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      if (dirtyRef.current) {
        saveDraftRef.current.mutate(bodyRef.current)
      }
    }
  }, [])

  function setBody(value: string) {
    setBodyState(value)
    bodyRef.current = value
    setDirty(true)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveDraft.mutate(bodyRef.current, { onSuccess: () => setDirty(false) })
    }, AUTOSAVE_DELAY_MS)
  }

  function flush() {
    if (dirty) {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveDraft.mutate(bodyRef.current, { onSuccess: () => setDirty(false) })
    }
  }

  return {
    body,
    setBody,
    flush,
    isLoading,
    isSaving: saveDraft.isPending,
    dirty,
  }
}
