import { useCallback, useMemo, useState } from 'react'
import type { HelperConversation, HelperUserProfile } from './helperTypes'
import { getStaffChats, takeChat, useStaffChats } from '../../../support/supportStores'

// The Helper panel's chats, from the support store (support/supportStores.ts) as the staff member acting sees them: the chat heads
// are the chats they are in; "New chat" takes the next one waiting (the oldest); the profiles feed the sidebar's queue counts (the
// chats they are in, as active, and the ones waiting).

export function useHelperChats() {
  const { view } = useStaffChats()
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

  const conversations: HelperConversation[] = useMemo(() => view.mine.map(c => ({ id: c.id, label: c.userName || 'A writer' })), [view.mine])
  const profiles: HelperUserProfile[] = useMemo(() => [
    ...view.mine.map(c => ({ chatId: c.id, name: c.userName || 'A writer', status: 'Active now', userType: 'standard' as const, currentProjectTitle: '', activity: { wordCountTotal: 0, chapterCount: 0, sceneCount: 0, lastActiveAt: c.createdAt } })),
    ...view.waiting.map(c => ({ chatId: c.id, name: c.userName || 'A writer', status: 'Waiting', userType: 'standard' as const, currentProjectTitle: '', activity: { wordCountTotal: 0, chapterCount: 0, sceneCount: 0, lastActiveAt: c.waitingSince } })),
  ], [view.mine, view.waiting])

  // A chat that is no longer theirs (transferred, escalated, closed) is let go.
  const selected = selectedChatId && view.mine.some(c => c.id === selectedChatId) ? selectedChatId : null

  const selectChat = useCallback((chatId: string | null) => { setSelectedChatId(chatId) }, [])

  // Takes the next chat waiting (the oldest) and opens it; returns its id, or null when nothing is waiting.
  function createConversation(): string | null {
    const next = getStaffChats().view.waiting[0]
    if (!next) return null
    setSelectedChatId(next.id)
    void takeChat(next.id)
    return next.id
  }

  return { conversations, profiles, selectedChatId: selected, selectChat, createConversation }
}

export type HelperChats = ReturnType<typeof useHelperChats>
