import { api } from './client'
import type { CreateProjectRequest, ProjectIndex, ProjectSummaryResponse } from './types'

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

export function deleteProject(projectId: string): Promise<void> {
  return api.delete<void>(`/projects/${encodeURIComponent(projectId)}`)
}
