import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DiffOp, RevisionComment, RevisionSnapshot, RevisionSummary } from '../types'

const listKey = (projectId: string, chapterId: string) =>
  ['projects', projectId, 'revisions', chapterId] as const
const snapshotKey = (projectId: string, chapterId: string, snapshotId: string) =>
  ['projects', projectId, 'revisions', chapterId, snapshotId] as const
const diffKey = (projectId: string, chapterId: string, momentId: string, from: string, to: string) =>
  ['projects', projectId, 'revisions', chapterId, 'diff', momentId, from, to] as const

export function useRevisions(projectId: string | undefined, chapterId: string | undefined) {
  return useQuery({
    queryKey: projectId && chapterId ? listKey(projectId, chapterId) : ['revisions', 'none'],
    queryFn: () => api.get<RevisionSummary[]>(`/projects/${projectId}/revisions/${chapterId}`),
    enabled: Boolean(projectId && chapterId),
  })
}

export function useSnapshot(
  projectId: string | undefined,
  chapterId: string | undefined,
  snapshotId: string | undefined
) {
  return useQuery({
    queryKey:
      projectId && chapterId && snapshotId
        ? snapshotKey(projectId, chapterId, snapshotId)
        : ['snapshot', 'none'],
    queryFn: () =>
      api.get<RevisionSnapshot>(`/projects/${projectId}/revisions/${chapterId}/${snapshotId}`),
    enabled: Boolean(projectId && chapterId && snapshotId),
  })
}

export function useDiff(
  projectId: string | undefined,
  chapterId: string | undefined,
  momentId: string | undefined,
  from: string | undefined,
  to: string = 'current'
) {
  return useQuery({
    queryKey:
      projectId && chapterId && momentId && from ? diffKey(projectId, chapterId, momentId, from, to) : ['diff', 'none'],
    queryFn: () =>
      api.get<{ ops: DiffOp[] }>(
        `/projects/${projectId}/revisions/${chapterId}/diff?momentId=${encodeURIComponent(momentId as string)}&from=${encodeURIComponent(from as string)}&to=${encodeURIComponent(to)}`
      ),
    enabled: Boolean(projectId && chapterId && momentId && from),
  })
}

// Manual save -- no naming step, backend derives the label from the save's
// own date/time.
export function useCreateSnapshot(projectId: string, chapterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${chapterId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, chapterId) })
    },
  })
}

export function useRevertToSnapshot(projectId: string, chapterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${chapterId}/${snapshotId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, chapterId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'draft', 'chapter', chapterId] })
    },
  })
}

interface AddCommentInput {
  snapshotId: string
  momentId: string
  body: string
  anchorStart: number
  anchorEnd: number
  flag?: 'primary' | 'secondary' | null
}

export function useAddComment(projectId: string, chapterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, ...input }: AddCommentInput) =>
      api.post<RevisionComment>(
        `/projects/${projectId}/revisions/${chapterId}/${snapshotId}/notes`,
        input
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, chapterId, variables.snapshotId),
      })
    },
  })
}

export function useDeleteComment(projectId: string, chapterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, noteId }: { snapshotId: string; noteId: string }) =>
      api.delete<void>(`/projects/${projectId}/revisions/${chapterId}/${snapshotId}/notes/${noteId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, chapterId, variables.snapshotId),
      })
    },
  })
}
