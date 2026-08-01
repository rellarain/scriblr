import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  OutlineNodeKind,
  PlotNodeKind,
  ProjectIndex,
  ProjectPriority,
  ProjectRoutine,
  ProjectSummary,
} from '../types'

const projectsKey = ['projects'] as const
const projectKey = (projectId: string) => ['projects', projectId] as const

export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: () => api.get<ProjectIndex[]>('/projects'),
  })
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? projectKey(projectId) : ['projects', 'none'],
    queryFn: () => api.get<ProjectSummary>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) => api.post<ProjectIndex>('/projects', { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey })
    },
  })
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: {
      title?: string
      wordCountTarget?: number
      bookCountTarget?: number
      bookWordCountTarget?: number
      chapterWordCountTarget?: number
      priorities?: ProjectPriority[]
      routines?: ProjectRoutine[]
      outlineLevels?: OutlineNodeKind[]
      plotLevels?: PlotNodeKind[]
      readLevels?: OutlineNodeKind[]
    }) => api.patch<ProjectIndex>(`/projects/${projectId}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey })
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => api.delete<void>(`/projects/${projectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey })
    },
  })
}
