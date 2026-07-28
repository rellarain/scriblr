import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { OutlineRevertResponse, OutlineSnapshotDetail, OutlineTree, TreeDiffResponse, TreeSnapshotSummary } from '../types'

const outlineKey = (projectId: string) => ['projects', projectId, 'outline'] as const
const historyKey = (projectId: string) => ['projects', projectId, 'outline', 'history'] as const
const snapshotKey = (projectId: string, snapshotId: string) =>
  ['projects', projectId, 'outline', 'history', snapshotId] as const
const diffKey = (projectId: string, from: string, to: string) =>
  ['projects', projectId, 'outline', 'history', 'diff', from, to] as const

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
      queryClient.invalidateQueries({ queryKey: historyKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
    },
  })
}

export function useOutlineHistory(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? historyKey(projectId) : ['outline-history', 'none'],
    queryFn: () => api.get<TreeSnapshotSummary[]>(`/projects/${projectId}/outline/history`),
    enabled: Boolean(projectId),
  })
}

export function useOutlineSnapshot(projectId: string | undefined, snapshotId: string | undefined) {
  return useQuery({
    queryKey: projectId && snapshotId ? snapshotKey(projectId, snapshotId) : ['outline-snapshot', 'none'],
    queryFn: () =>
      api.get<OutlineSnapshotDetail>(`/projects/${projectId}/outline/history/${snapshotId}`),
    enabled: Boolean(projectId && snapshotId),
  })
}

export function useOutlineDiff(
  projectId: string | undefined,
  from: string | undefined,
  to: string = 'current'
) {
  return useQuery({
    queryKey: projectId && from ? diffKey(projectId, from, to) : ['outline-diff', 'none'],
    queryFn: () =>
      api.get<TreeDiffResponse>(
        `/projects/${projectId}/outline/history/diff?from=${encodeURIComponent(from as string)}&to=${encodeURIComponent(to)}`
      ),
    enabled: Boolean(projectId && from),
  })
}

export function useRevertOutline(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<OutlineRevertResponse>(`/projects/${projectId}/outline/history/${snapshotId}/revert`),
    onSuccess: (result) => {
      queryClient.setQueryData(outlineKey(projectId), result.outline)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: historyKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
    },
  })
}
