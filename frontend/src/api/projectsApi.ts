import { api } from './client'
import type { CreateProjectRequest, ProjectIndex, ProjectSummaryResponse, TimeSystem } from './types'

export function listProjects(): Promise<ProjectIndex[]> {
  return api.get<ProjectIndex[]>('/projects')
}

export function createProject(title: string): Promise<ProjectIndex> {
  const body: CreateProjectRequest = { title }
  return api.post<ProjectIndex>('/projects', body)
}

export function getProject(projectId: string): Promise<ProjectSummaryResponse> {
  return api.get<ProjectSummaryResponse>(`/projects/${encodeURIComponent(projectId)}`)
}

// Changes project settings (only the fields given are changed).
export function updateProject(projectId: string, patch: { timeSystems?: TimeSystem[] }): Promise<ProjectIndex> {
  return api.patch<ProjectIndex>(`/projects/${encodeURIComponent(projectId)}`, patch)
}

export function deleteProject(projectId: string): Promise<void> {
  return api.delete<void>(`/projects/${encodeURIComponent(projectId)}`)
}
