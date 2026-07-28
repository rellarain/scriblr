import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { PlotTree } from '../types'

const plotKey = (projectId: string) => ['projects', projectId, 'plot'] as const

export function usePlot(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? plotKey(projectId) : ['plot', 'none'],
    queryFn: () => api.get<PlotTree>(`/projects/${projectId}/plot`),
    enabled: Boolean(projectId),
  })
}

export function useSavePlot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tree: PlotTree) => api.put<PlotTree>(`/projects/${projectId}/plot`, tree),
    onSuccess: (tree) => {
      queryClient.setQueryData(plotKey(projectId), tree)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
