import { api } from './client'
import type { CreateProjectRequest, ProjectIndex, ProjectOverview, ProjectSummaryResponse, TimeSystem } from './types'

// Every project with its outline and book progress, in one request.
export function getProjectsOverview(): Promise<ProjectOverview[]> {
  return api.get<ProjectOverview[]>('/projects/overview')
}

export function createProject(title: string): Promise<ProjectIndex> {
  const body: CreateProjectRequest = { title }
  return api.post<ProjectIndex>('/projects', body)
}

export function getProject(projectId: string): Promise<ProjectSummaryResponse> {
  return api.get<ProjectSummaryResponse>(`/projects/${encodeURIComponent(projectId)}`)
}

// Changes project settings (only the fields given are changed).
export function updateProject(projectId: string, patch: { timeSystems?: TimeSystem[]; themeHue?: number }): Promise<ProjectIndex> {
  return api.patch<ProjectIndex>(`/projects/${encodeURIComponent(projectId)}`, patch)
}

export function deleteProject(projectId: string): Promise<void> {
  return api.delete<void>(`/projects/${encodeURIComponent(projectId)}`)
}
