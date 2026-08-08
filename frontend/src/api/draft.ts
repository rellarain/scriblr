import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from './client'
import type { DraftChapter, DraftMoment } from '../types'

const draftKey = (projectId: string, chapterId: string, momentId: string) =>
  ['projects', projectId, 'draft', 'chapter', chapterId, 'moment', momentId] as const

const chapterDraftKey = (projectId: string, chapterId: string) =>
  ['projects', projectId, 'draft', 'chapter', chapterId] as const

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

function emptyChapterDraft(chapterId: string): DraftChapter {
  return { schemaVersion: 2, chapterId, updatedAt: new Date().toISOString(), moments: {} }
}

// Fetches an entire chapter's moments in one call.
export function useChapterDraft(projectId: string | undefined, chapterId: string | undefined) {
  return useQuery({
    queryKey: projectId && chapterId ? chapterDraftKey(projectId, chapterId) : ['draft', 'chapter', 'none'],
    queryFn: async () => {
      try {
        return await api.get<DraftChapter>(`/projects/${projectId}/draft/chapter/${chapterId}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return emptyChapterDraft(chapterId as string)
        }
        throw e
      }
    },
    enabled: Boolean(projectId && chapterId),
  })
}

export function useDraft(
  projectId: string | undefined,
  chapterId: string | undefined,
  momentId: string | undefined
) {
  return useQuery({
    queryKey: projectId && chapterId && momentId ? draftKey(projectId, chapterId, momentId) : ['draft', 'none'],
    queryFn: async () => {
      try {
        return await api.get<DraftMoment>(`/projects/${projectId}/draft/chapter/${chapterId}/moment/${momentId}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return emptyDraft(momentId as string)
        }
        throw e
      }
    },
    enabled: Boolean(projectId && chapterId && momentId),
  })
}

export function useSaveDraft(projectId: string, chapterId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api.put<DraftMoment>(`/projects/${projectId}/draft/chapter/${chapterId}/moment/${momentId}`, {
        outlineNodeId: momentId,
        body,
      }),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(projectId, chapterId, momentId), draft)
      queryClient.invalidateQueries({ queryKey: chapterDraftKey(projectId, chapterId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
