import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { OutlineTree, ScrapRegistry } from '../types'

const scrapKey = (projectId: string) => ['projects', projectId, 'scrap'] as const

export function useScrap(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? scrapKey(projectId) : ['scrap', 'none'],
    queryFn: () => api.get<ScrapRegistry>(`/projects/${projectId}/scrap`),
    enabled: Boolean(projectId),
  })
}

interface RestoreInput {
  momentId: string
  parentId: string
  title?: string
}

export function useRestoreScrapEntry(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, parentId, title }: RestoreInput) =>
      api.post<OutlineTree>(`/projects/${projectId}/scrap/${momentId}/restore`, { parentId, title }),
    onSuccess: (outline, variables) => {
      queryClient.setQueryData(['projects', projectId, 'outline'], outline)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: scrapKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'draft', variables.momentId],
      })
    },
  })
}

export function useDeleteScrapEntry(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (momentId: string) => api.delete<void>(`/projects/${projectId}/scrap/${momentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
