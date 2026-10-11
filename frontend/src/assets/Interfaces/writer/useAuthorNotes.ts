import { useCallback, useEffect, useState } from 'react'
import { getAuthorNotes, getListing, putAuthorNotes, type BookFlagMeta, type ChapterAuthorNotes } from '../../../api/bookPublishing'

const EMPTY: ChapterAuthorNotes = { footnotes: [], flags: [] }

// A chapter's author footnotes and flagged passages (saved as they change), and the book's content flags the passages can carry.
export function useAuthorNotes(projectId: string | null, chapterId: string | null, bookId: string | null) {
  const [notes, setNotes] = useState<ChapterAuthorNotes>(EMPTY)
  const [flags, setFlags] = useState<BookFlagMeta[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let live = true
    setNotes(EMPTY); setError(undefined)
    if (!projectId || !chapterId) return undefined
    getAuthorNotes(projectId, chapterId).then(n => { if (live) setNotes({ footnotes: n?.footnotes ?? [], flags: n?.flags ?? [] }) }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the footnotes.') })
    return () => { live = false }
  }, [projectId, chapterId])

  useEffect(() => {
    let live = true
    setFlags([])
    if (!projectId || !bookId) return undefined
    getListing(projectId, bookId).then(l => { if (live) setFlags(l?.meta?.flags ?? []) }).catch(() => undefined)
    return () => { live = false }
  }, [projectId, bookId])

  const save = useCallback(async (next: ChapterAuthorNotes) => {
    if (!projectId || !chapterId) return
    setNotes(next)
    setError(undefined)
    try { setNotes(await putAuthorNotes(projectId, chapterId, next)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }, [projectId, chapterId])

  return { notes, flags, error, save }
}
