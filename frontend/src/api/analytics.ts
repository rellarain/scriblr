import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ProjectAnalytics } from '../types'

const analyticsKey = (projectId: string) => ['projects', projectId, 'analytics'] as const

export function useAnalytics(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? analyticsKey(projectId) : ['analytics', 'none'],
    queryFn: () => api.get<ProjectAnalytics>(`/projects/${projectId}/analytics`),
    enabled: Boolean(projectId),
  })
}
