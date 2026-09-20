import { useCallback, useEffect, useState } from 'react'
import { listPublications, publishChapter } from '../../../api/publicationFetch'
import type { Publication } from '../../../api/types'

// A chapter's kept publications (newest first; the server keeps the last three)
// and the action that publishes its current draft.
export function usePublications(projectId: string | null, chapterId: string | null) {
  const [publications, setPublications] = useState<Publication[]>([])
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setPublications([])
    setError(undefined)
    if (!projectId || !chapterId) return
    listPublications(projectId, chapterId)
      .then(list => { if (!cancelled) setPublications(list) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the publications') })
    return () => { cancelled = true }
  }, [projectId, chapterId])

  // The caller saves the draft first, so what is published is what was written.
  const publish = useCallback(async () => {
    if (!projectId || !chapterId) return
    setPublishing(true)
    setError(undefined)
    try {
      await publishChapter(projectId, chapterId)
      setPublications(await listPublications(projectId, chapterId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publishing failed')
    } finally {
      setPublishing(false)
    }
  }, [projectId, chapterId])

  return { publications, publishing, error, publish }
}
