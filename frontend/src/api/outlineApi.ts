import { api } from './client'
import type { OutlineTree } from './types'

export function getOutline(projectId: string): Promise<OutlineTree> {
  return api.get<OutlineTree>(`/projects/${encodeURIComponent(projectId)}/outline`)
}

export function putOutline(projectId: string, tree: OutlineTree): Promise<OutlineTree> {
  return api.put<OutlineTree>(`/projects/${encodeURIComponent(projectId)}/outline`, tree)
}
