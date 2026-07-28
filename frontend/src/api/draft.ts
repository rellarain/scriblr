import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from './client'
import type { DraftScene } from '../types'

const draftKey = (projectId: string, sceneId: string) => ['projects', projectId, 'draft', sceneId] as const

function emptyDraft(sceneId: string): DraftScene {
  return {
    schemaVersion: 1,
    sceneId,
    outlineNodeId: sceneId,
    updatedAt: new Date().toISOString(),
    wordCount: 0,
    format: 'markdown',
    body: '',
  }
}

export function useDraft(projectId: string | undefined, sceneId: string | undefined) {
  return useQuery({
    queryKey: projectId && sceneId ? draftKey(projectId, sceneId) : ['draft', 'none'],
    queryFn: async () => {
      try {
        return await api.get<DraftScene>(`/projects/${projectId}/draft/${sceneId}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return emptyDraft(sceneId as string)
        }
        throw e
      }
    },
    enabled: Boolean(projectId && sceneId),
  })
}

export function useSaveDraft(projectId: string, sceneId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api.put<DraftScene>(`/projects/${projectId}/draft/${sceneId}`, {
        outlineNodeId: sceneId,
        body,
      }),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(projectId, sceneId), draft)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
