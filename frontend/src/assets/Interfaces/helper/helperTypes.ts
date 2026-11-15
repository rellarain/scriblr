// A chat head in the sidebar (SidebarDivider): one per support chat the staff member acting is in.
export interface HelperConversation {
  id: string
  label: string
}

export type HelperUserType = 'admin' | 'standard'

// What the sidebar's queue counts read: a chat being helped ("Active now") or waiting.
export interface HelperUserProfile {
  chatId: string
  name: string
  status: string
  userType: HelperUserType
  currentProjectTitle: string
  currentBookTitle?: string
  activity: {
    wordCountTotal: number
    wordCountGoal?: number
    chapterCount: number
    sceneCount: number
    lastActiveAt: string
  }
}
