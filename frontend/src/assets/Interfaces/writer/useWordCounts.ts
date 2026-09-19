import { useEffect, useState } from 'react'
import { getWordCounts, type WordCounts } from '../../../api/draftFetch'

const NONE: WordCounts = { chapters: {}, books: {} }

// Draft word counts for a project's books and chapters, read when the
// component mounts (or the project changes).
export function useWordCounts(projectId: string | null): WordCounts {
  const [counts, setCounts] = useState<WordCounts>(NONE)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getWordCounts(projectId).then(next => { if (!cancelled) setCounts(next) }, () => {})
    return () => { cancelled = true }
  }, [projectId])
  return counts
}
