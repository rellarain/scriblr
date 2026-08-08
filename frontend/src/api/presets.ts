import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { PresetCatalog } from '../types'

const presetsKey = ['presets'] as const

export function usePresets() {
  return useQuery({
    queryKey: presetsKey,
    queryFn: () => api.get<PresetCatalog>('/presets'),
  })
}

export function useSavePresets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (catalog: PresetCatalog) => api.put<PresetCatalog>('/presets', catalog),
    onSuccess: (catalog) => {
      queryClient.setQueryData(presetsKey, catalog)
    },
  })
}
