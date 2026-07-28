import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DiffOp, RevisionComment, RevisionSnapshot, RevisionSummary } from '../types'

const listKey = (projectId: string, momentId: string) =>
  ['projects', projectId, 'revisions', momentId] as const
const snapshotKey = (projectId: string, momentId: string, snapshotId: string) =>
  ['projects', projectId, 'revisions', momentId, snapshotId] as const
const diffKey = (projectId: string, momentId: string, from: string, to: string) =>
  ['projects', projectId, 'revisions', momentId, 'diff', from, to] as const

export function useRevisions(projectId: string | undefined, momentId: string | undefined) {
  return useQuery({
    queryKey: projectId && momentId ? listKey(projectId, momentId) : ['revisions', 'none'],
    queryFn: () => api.get<RevisionSummary[]>(`/projects/${projectId}/revisions/${momentId}`),
    enabled: Boolean(projectId && momentId),
  })
}

export function useSnapshot(
  projectId: string | undefined,
  momentId: string | undefined,
  snapshotId: string | undefined
) {
  return useQuery({
    queryKey:
      projectId && momentId && snapshotId
        ? snapshotKey(projectId, momentId, snapshotId)
        : ['snapshot', 'none'],
    queryFn: () =>
      api.get<RevisionSnapshot>(`/projects/${projectId}/revisions/${momentId}/${snapshotId}`),
    enabled: Boolean(projectId && momentId && snapshotId),
  })
}

export function useDiff(
  projectId: string | undefined,
  momentId: string | undefined,
  from: string | undefined,
  to: string = 'current'
) {
  return useQuery({
    queryKey: projectId && momentId && from ? diffKey(projectId, momentId, from, to) : ['diff', 'none'],
    queryFn: () =>
      api.get<{ ops: DiffOp[] }>(
        `/projects/${projectId}/revisions/${momentId}/diff?from=${encodeURIComponent(from as string)}&to=${encodeURIComponent(to)}`
      ),
    enabled: Boolean(projectId && momentId && from),
  })
}

export function useCreateSnapshot(projectId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) =>
      api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${momentId}`, { label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, momentId) })
    },
  })
}

export function useRevertToSnapshot(projectId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${momentId}/${snapshotId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, momentId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'draft', momentId] })
    },
  })
}

interface AddCommentInput {
  snapshotId: string
  body: string
  anchorStart: number
  anchorEnd: number
  flag?: 'primary' | 'secondary' | null
}

export function useAddComment(projectId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, ...input }: AddCommentInput) =>
      api.post<RevisionComment>(
        `/projects/${projectId}/revisions/${momentId}/${snapshotId}/notes`,
        input
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, momentId, variables.snapshotId),
      })
    },
  })
}

export function useDeleteComment(projectId: string, momentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, noteId }: { snapshotId: string; noteId: string }) =>
      api.delete<void>(`/projects/${projectId}/revisions/${momentId}/${snapshotId}/notes/${noteId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, momentId, variables.snapshotId),
      })
    },
  })
}
