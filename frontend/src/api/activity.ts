import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ActivityResponse } from '../types'

const activityKey = (projectId: string) => ['projects', projectId, 'activity'] as const

export function useActivity(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? activityKey(projectId) : ['activity', 'none'],
    queryFn: () => api.get<ActivityResponse>(`/projects/${projectId}/activity`),
    enabled: Boolean(projectId),
  })
}
