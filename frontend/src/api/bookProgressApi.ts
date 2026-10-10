import { api } from './client'
import type { BookProgress } from './types'

// Per book id: the progress bars of its spine on the shelf.
export function getBookProgress(projectId: string): Promise<Record<string, BookProgress>> {
  return api.get<Record<string, BookProgress>>(`/projects/${encodeURIComponent(projectId)}/book-progress`)
}
