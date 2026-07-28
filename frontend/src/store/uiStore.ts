import { create } from 'zustand'

interface UiState {
  selectedSceneId: string | null
  sidebarCollapsed: boolean
  setSelectedSceneId: (sceneId: string | null) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedSceneId: null,
  sidebarCollapsed: false,
  setSelectedSceneId: (sceneId) => set({ selectedSceneId: sceneId }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}))
