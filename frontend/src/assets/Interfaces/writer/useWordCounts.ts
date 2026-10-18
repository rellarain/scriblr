import { useEffect, useState } from 'react'
import { getWordCounts, type WordCounts } from '../../../api/draftFetch'

const NONE: WordCounts = { chapters: {}, books: {}, nodes: {} }

// Several components read the counts when they mount (the Outline's tabs, the Project's, the project outline), often in the same
// breath: they share the one request while it is under way. Once it has answered, the next reader asks again, so a count is never
// older than the moment its component appeared.
const inFlight = new Map<string, Promise<WordCounts>>()

export function fetchWordCounts(projectId: string): Promise<WordCounts> {
  const running = inFlight.get(projectId)
  if (running) return running
  const request = getWordCounts(projectId).finally(() => { inFlight.delete(projectId) })
  inFlight.set(projectId, request)
  return request
}

// Draft word counts for a project's books and chapters, read when the
// component mounts (or the project changes).
export function useWordCounts(projectId: string | null): WordCounts {
  const [counts, setCounts] = useState<WordCounts>(NONE)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetchWordCounts(projectId).then(next => { if (!cancelled) setCounts(next) }, () => {})
    return () => { cancelled = true }
  }, [projectId])
  return counts
}
