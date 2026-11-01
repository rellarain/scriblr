import { api } from '../../../../api/client'
import type { FacetActivityData, Planner, RibbonData } from '../../../../lib/facets'

// The Schedule console's endpoints (backend/app/api/facets.py, revision_flags.py, schedule.py).

const p = (id: string) => encodeURIComponent(id)

export const getFacetActivity = (projectId: string) => api.get<FacetActivityData>(`/projects/${p(projectId)}/activity/facets`)
export const getPlanner = (projectId: string) => api.get<Planner>(`/projects/${p(projectId)}/planner`)
export const putPlanner = (projectId: string, planner: Planner) => api.put<Planner>(`/projects/${p(projectId)}/planner`, planner)
export const getRibbon = () => api.get<RibbonData>('/activity/ribbon')
export const getTicks = (projectId: string, date: string) => api.get<string[]>(`/projects/${p(projectId)}/schedule/${date}`)
export const putTicks = (projectId: string, date: string, ids: string[]) => api.put<string[]>(`/projects/${p(projectId)}/schedule/${date}`, { completedItemIds: ids })

export interface RevisionFlag {
  id: string
  scope: 'passage' | 'project'
  type: 'review' | 'edit' | 'add' | 'delete'
  note: string
  chapterId: string | null
  momentId: string | null
  start: number
  end: number
  snippet: string
  stale: boolean
  createdAt: string
  resolvedAt: string | null
  outcome: string
}
export const getRevisionFlags = (projectId: string, includeResolved = false) =>
  api.get<RevisionFlag[]>(`/projects/${p(projectId)}/revision-flags${includeResolved ? '?includeResolved=true' : ''}`)

export type RevisionFlagType = RevisionFlag['type']
export interface NewRevisionFlag { scope: 'passage' | 'project'; type: RevisionFlagType; note?: string; chapterId?: string; momentId?: string; start?: number; end?: number }
export const createRevisionFlag = (projectId: string, body: NewRevisionFlag) => api.post<RevisionFlag>(`/projects/${p(projectId)}/revision-flags`, body)
export const updateRevisionFlag = (projectId: string, id: string, body: { type?: RevisionFlagType; note?: string }) => api.patch<RevisionFlag>(`/projects/${p(projectId)}/revision-flags/${p(id)}`, body)
export const resolveRevisionFlag = (projectId: string, id: string, outcome: string) => api.post<RevisionFlag>(`/projects/${p(projectId)}/revision-flags/${p(id)}/resolve`, { outcome })
export const deleteRevisionFlag = (projectId: string, id: string) => api.delete<void>(`/projects/${p(projectId)}/revision-flags/${p(id)}`)
