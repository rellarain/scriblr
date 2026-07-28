import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { OutlineTree } from '../types'

const outlineKey = (projectId: string) => ['projects', projectId, 'outline'] as const

export function useOutline(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? outlineKey(projectId) : ['outline', 'none'],
    queryFn: () => api.get<OutlineTree>(`/projects/${projectId}/outline`),
    enabled: Boolean(projectId),
  })
}

export function useSaveOutline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tree: OutlineTree) => api.put<OutlineTree>(`/projects/${projectId}/outline`, tree),
    onSuccess: (tree) => {
      queryClient.setQueryData(outlineKey(projectId), tree)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
