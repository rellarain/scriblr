import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { BrainstormNote, BrainstormNotes } from '../types'

const brainstormKey = (projectId: string) => ['projects', projectId, 'brainstorm'] as const

export function useBrainstorm(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? brainstormKey(projectId) : ['brainstorm', 'none'],
    queryFn: () => api.get<BrainstormNotes>(`/projects/${projectId}/brainstorm`),
    enabled: Boolean(projectId),
  })
}

interface CreateNoteInput {
  body: string
  tags?: string[]
  linkedOutlineNodeId?: string | null
}

export function useCreateNote(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateNoteInput) =>
      api.post<BrainstormNote>(`/projects/${projectId}/brainstorm`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brainstormKey(projectId) })
    },
  })
}

interface UpdateNoteInput {
  noteId: string
  body?: string
  tags?: string[]
  linkedOutlineNodeId?: string | null
}

export function useUpdateNote(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, ...patch }: UpdateNoteInput) =>
      api.patch<BrainstormNote>(`/projects/${projectId}/brainstorm/${noteId}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brainstormKey(projectId) })
    },
  })
}

export function useDeleteNote(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => api.delete<void>(`/projects/${projectId}/brainstorm/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brainstormKey(projectId) })
    },
  })
}
