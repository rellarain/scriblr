import { api } from './client'
import type { WorldLink } from './types'

// Links between a plot node, a character and a place (backend: api/world_links.py). Every call answers with the project's links.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/world-links`

export const listWorldLinks = (projectId: string) => api.get<WorldLink[]>(base(projectId))
export const addWorldLink = (projectId: string, a: string, b: string) => api.post<WorldLink[]>(base(projectId), { a, b })
export const removeWorldLink = (projectId: string, a: string, b: string) => api.delete<WorldLink[]>(`${base(projectId)}?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
