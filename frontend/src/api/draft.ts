import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from './client'
import type { DraftMoment } from '../types'

const draftKey = (projectId: string, momentId: string) =>
  ['projects', projectId, 'draft', momentId] as const

function emptyDraft(momentId: string): DraftMoment {
  return {
    schemaVersion: 2,
    momentId,
    outlineNodeId: momentId,
    updatedAt: new Date().toISOString(),
    wordCount: 0,
    format: 'markdown',
    body: '',
  }
}

export function useDraft(projectId: string | undefined, momentId: string | undefined) {
  return useQuery({
    queryKey: projectId && momentId ? draftKey(projectId, momentId) : ['draft', 'none'],
    queryFn: async () => {
      try {
        return await api.get<DraftMoment>(`/projects/${projectId}/draft/${momentId}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return emptyDraft(momentId as string)
        }
        throw e
      }
    },
    enabled: Boolean(projectId && momentId),
  })
}

export function useSaveDraft(projectId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api.put<DraftMoment>(`/projects/${projectId}/draft/${momentId}`, {
        outlineNodeId: momentId,
        body,
      }),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(projectId, momentId), draft)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
