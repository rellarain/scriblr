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
    onSuccess: (outline) => {
      queryClient.setQueryData(['projects', projectId, 'outline'], outline)
      // Broad invalidation (covers draft/chapter queries too) since restoring
      // a moment reattaches draft content already stored under its
      // last-known chapter.
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: scrapKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
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
