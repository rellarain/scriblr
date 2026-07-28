import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

const completionsKey = (projectId: string, date: string) =>
  ['projects', projectId, 'schedule', date] as const

export function useScheduleCompletions(projectId: string | undefined, date: string) {
  return useQuery({
    queryKey: projectId ? completionsKey(projectId, date) : ['schedule', 'none'],
    queryFn: () => api.get<string[]>(`/projects/${projectId}/schedule/${date}`),
    enabled: Boolean(projectId),
  })
}

export function useSetScheduleCompletions(projectId: string, date: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (completedItemIds: string[]) =>
      api.put<string[]>(`/projects/${projectId}/schedule/${date}`, { completedItemIds }),
    onSuccess: (completedItemIds) => {
      queryClient.setQueryData(completionsKey(projectId, date), completedItemIds)
    },
  })
}
