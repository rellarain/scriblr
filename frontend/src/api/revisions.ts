import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DiffOp, RevisionComment, RevisionSnapshot, RevisionSummary } from '../types'

const listKey = (projectId: string, sceneId: string) =>
  ['projects', projectId, 'revisions', sceneId] as const
const snapshotKey = (projectId: string, sceneId: string, snapshotId: string) =>
  ['projects', projectId, 'revisions', sceneId, snapshotId] as const
const diffKey = (projectId: string, sceneId: string, from: string, to: string) =>
  ['projects', projectId, 'revisions', sceneId, 'diff', from, to] as const

export function useRevisions(projectId: string | undefined, sceneId: string | undefined) {
  return useQuery({
    queryKey: projectId && sceneId ? listKey(projectId, sceneId) : ['revisions', 'none'],
    queryFn: () => api.get<RevisionSummary[]>(`/projects/${projectId}/revisions/${sceneId}`),
    enabled: Boolean(projectId && sceneId),
  })
}

export function useSnapshot(
  projectId: string | undefined,
  sceneId: string | undefined,
  snapshotId: string | undefined
) {
  return useQuery({
    queryKey:
      projectId && sceneId && snapshotId
        ? snapshotKey(projectId, sceneId, snapshotId)
        : ['snapshot', 'none'],
    queryFn: () =>
      api.get<RevisionSnapshot>(`/projects/${projectId}/revisions/${sceneId}/${snapshotId}`),
    enabled: Boolean(projectId && sceneId && snapshotId),
  })
}

export function useDiff(
  projectId: string | undefined,
  sceneId: string | undefined,
  from: string | undefined,
  to: string = 'current'
) {
  return useQuery({
    queryKey: projectId && sceneId && from ? diffKey(projectId, sceneId, from, to) : ['diff', 'none'],
    queryFn: () =>
      api.get<{ ops: DiffOp[] }>(
        `/projects/${projectId}/revisions/${sceneId}/diff?from=${encodeURIComponent(from as string)}&to=${encodeURIComponent(to)}`
      ),
    enabled: Boolean(projectId && sceneId && from),
  })
}

export function useCreateSnapshot(projectId: string, sceneId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) =>
      api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${sceneId}`, { label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, sceneId) })
    },
  })
}

export function useRevertToSnapshot(projectId: string, sceneId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<RevisionSnapshot>(`/projects/${projectId}/revisions/${sceneId}/${snapshotId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(projectId, sceneId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'draft', sceneId] })
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

export function useAddComment(projectId: string, sceneId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, ...input }: AddCommentInput) =>
      api.post<RevisionComment>(
        `/projects/${projectId}/revisions/${sceneId}/${snapshotId}/notes`,
        input
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, sceneId, variables.snapshotId),
      })
    },
  })
}

export function useDeleteComment(projectId: string, sceneId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotId, noteId }: { snapshotId: string; noteId: string }) =>
      api.delete<void>(`/projects/${projectId}/revisions/${sceneId}/${snapshotId}/notes/${noteId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: snapshotKey(projectId, sceneId, variables.snapshotId),
      })
    },
  })
}
