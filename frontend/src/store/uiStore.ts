import { create } from 'zustand'

interface UiState {
  selectedMomentId: string | null
  sidebarCollapsed: boolean
  setSelectedMomentId: (momentId: string | null) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedMomentId: null,
  sidebarCollapsed: false,
  setSelectedMomentId: (momentId) => set({ selectedMomentId: momentId }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}))
