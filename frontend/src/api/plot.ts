import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { PlotRevertResponse, PlotSnapshotDetail, PlotTree, TreeDiffResponse, TreeSnapshotSummary } from '../types'

const plotKey = (projectId: string) => ['projects', projectId, 'plot'] as const
const historyKey = (projectId: string) => ['projects', projectId, 'plot', 'history'] as const
const snapshotKey = (projectId: string, snapshotId: string) =>
  ['projects', projectId, 'plot', 'history', snapshotId] as const
const diffKey = (projectId: string, from: string, to: string) =>
  ['projects', projectId, 'plot', 'history', 'diff', from, to] as const

export function usePlot(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? plotKey(projectId) : ['plot', 'none'],
    queryFn: () => api.get<PlotTree>(`/projects/${projectId}/plot`),
    enabled: Boolean(projectId),
  })
}

export function useSavePlot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tree: PlotTree) => api.put<PlotTree>(`/projects/${projectId}/plot`, tree),
    onSuccess: (tree) => {
      queryClient.setQueryData(plotKey(projectId), tree)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: historyKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
    },
  })
}

export function usePlotHistory(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? historyKey(projectId) : ['plot-history', 'none'],
    queryFn: () => api.get<TreeSnapshotSummary[]>(`/projects/${projectId}/plot/history`),
    enabled: Boolean(projectId),
  })
}

export function usePlotSnapshot(projectId: string | undefined, snapshotId: string | undefined) {
  return useQuery({
    queryKey: projectId && snapshotId ? snapshotKey(projectId, snapshotId) : ['plot-snapshot', 'none'],
    queryFn: () => api.get<PlotSnapshotDetail>(`/projects/${projectId}/plot/history/${snapshotId}`),
    enabled: Boolean(projectId && snapshotId),
  })
}

export function usePlotDiff(
  projectId: string | undefined,
  from: string | undefined,
  to: string = 'current'
) {
  return useQuery({
    queryKey: projectId && from ? diffKey(projectId, from, to) : ['plot-diff', 'none'],
    queryFn: () =>
      api.get<TreeDiffResponse>(
        `/projects/${projectId}/plot/history/diff?from=${encodeURIComponent(from as string)}&to=${encodeURIComponent(to)}`
      ),
    enabled: Boolean(projectId && from),
  })
}

export function useRevertPlot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api.post<PlotRevertResponse>(`/projects/${projectId}/plot/history/${snapshotId}/revert`),
    onSuccess: (result) => {
      queryClient.setQueryData(plotKey(projectId), result.plot)
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: historyKey(projectId) })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] })
    },
  })
}
