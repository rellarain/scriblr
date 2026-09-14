import { api } from './client'
import type { PlotTree } from './types'

export function getPlot(projectId: string): Promise<PlotTree> {
  return api.get<PlotTree>(`/projects/${encodeURIComponent(projectId)}/plot`)
}

export function putPlot(projectId: string, tree: PlotTree): Promise<PlotTree> {
  return api.put<PlotTree>(`/projects/${encodeURIComponent(projectId)}/plot`, tree)
}
