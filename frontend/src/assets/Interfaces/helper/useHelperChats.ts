import { useCallback, useMemo, useState } from 'react'
import type { HelperConversation, HelperUserProfile } from './helperTypes'
import { getStaffChats, takeChat, useStaffChats } from '../../../support/supportStores'

// The Helper panel's chats, from the support store (support/supportStores.ts) as the staff member acting sees them: the chat heads
// are the chats they are in; "New chat" takes the chat that is next for them by the queues (their switchboard, tier, the queues'
// levels, then the oldest; backend storage/queues.py); the profiles list the chats they are in, as active, and the ones waiting.

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

  // Takes the chat that is next for the staff member and opens it; returns its id, or null when nothing is for them now.
  function createConversation(): string | null {
    const next = getStaffChats().view.next
    if (!next) return null
    setSelectedChatId(next)
    void takeChat(next)
    return next
  }

  return { conversations, profiles, selectedChatId: selected, selectChat, createConversation }
}

export type HelperChats = ReturnType<typeof useHelperChats>
