import { api } from './client'
import type { Publication } from './types'

// Plain-fetch calls for a chapter's publications (the Writer has no
// QueryClientProvider, like draftFetch.ts).

// The chapter's kept publications, newest first.
export function listPublications(projectId: string, chapterId: string): Promise<Publication[]> {
  return api.get<Publication[]>(`/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(chapterId)}`)
}

// Publish the chapter's current (saved) draft.
export function publishChapter(projectId: string, chapterId: string): Promise<Publication> {
  return api.post<Publication>(`/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(chapterId)}`, {})
}
