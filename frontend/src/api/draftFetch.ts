import { ApiError, api } from './client'
import type { DraftChapter, DraftMoment } from '../types'

// Plain-fetch counterparts of the React Query hooks in draft.ts, for the
// Writer interface (which has no QueryClientProvider): read a whole
// chapter's moment bodies in one call, and save one moment's body.

export async function getChapterDraft(projectId: string, chapterId: string): Promise<DraftChapter> {
  try {
    return await api.get<DraftChapter>(`/projects/${encodeURIComponent(projectId)}/draft/chapter/${encodeURIComponent(chapterId)}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { schemaVersion: 2, chapterId, updatedAt: new Date().toISOString(), moments: {} }
    }
    throw err
  }
}

export function putMomentDraft(projectId: string, chapterId: string, momentId: string, body: string): Promise<DraftMoment> {
  return api.put<DraftMoment>(
    `/projects/${encodeURIComponent(projectId)}/draft/chapter/${encodeURIComponent(chapterId)}/moment/${encodeURIComponent(momentId)}`,
    { outlineNodeId: momentId, body },
  )
}
