import { useMemo, useState } from 'react'
import type { ChannelTag, FormFieldDef, HelperMessage } from './helperTypes'
import { SEED_CONVERSATIONS, SEED_MESSAGES, SEED_PROFILES } from './helperSeed'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function useHelperChats() {
  const [conversations, setConversations] = useState(SEED_CONVERSATIONS)
  const [profiles, setProfiles] = useState(SEED_PROFILES)
  const [messages, setMessages] = useState(SEED_MESSAGES)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

  function selectChat(chatId: string | null) {
    setSelectedChatId(chatId)
  }

  // Creates a minimal placeholder conversation + profile (there's no real
  // "start a chat" flow yet) and selects it, returning its id.
  function createConversation(): string {
    const id = newId('chat')
    const label = `New chat ${conversations.length + 1}`
    setConversations(prev => [...prev, { id, label }])
    setProfiles(prev => [...prev, {
      chatId: id, name: label, status: 'Active now', userType: 'standard',
      currentProjectTitle: 'Untitled project',
      activity: { wordCountTotal: 0, chapterCount: 0, sceneCount: 0, lastActiveAt: new Date().toISOString() },
    }])
    setSelectedChatId(id)
    return id
  }

  function sendTextMessage(chatId: string, text: string) {
    if (!text.trim()) return
    setMessages(prev => [...prev, {
      id: newId('msg'), chatId, sender: 'admin', sentAt: new Date().toISOString(),
      kind: 'text', text: text.trim(),
    }])
  }

  function sendForm(chatId: string, title: string, fields: FormFieldDef[]) {
    if (!title.trim() || fields.length === 0) return
    setMessages(prev => [...prev, {
      id: newId('msg'), chatId, sender: 'admin', sentAt: new Date().toISOString(),
      kind: 'form', form: { title: title.trim(), fields, sent: true },
    }])
  }

  function sendPageLink(chatId: string, target: ChannelTag, label?: string) {
    setMessages(prev => [...prev, {
      id: newId('msg'), chatId, sender: 'admin', sentAt: new Date().toISOString(),
      kind: 'pageLink', pageLink: { target, label },
    }])
  }

  const messagesByChat = useMemo(() => {
    const map = new Map<string, HelperMessage[]>()
    for (const m of messages) {
      const bucket = map.get(m.chatId)
      if (bucket) bucket.push(m)
      else map.set(m.chatId, [m])
    }
    return map
  }, [messages])

  return {
    conversations, profiles, messages, selectedChatId, messagesByChat,
    selectChat, createConversation, sendTextMessage, sendForm, sendPageLink,
  }
}

export type HelperChats = ReturnType<typeof useHelperChats>
