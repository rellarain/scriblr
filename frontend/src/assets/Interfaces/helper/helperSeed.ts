import type { HelperConversation, HelperMessage, HelperUserProfile } from './helperTypes'

export const SEED_CONVERSATIONS: HelperConversation[] = [
  { id: 'chat-1', label: 'Chat with J. Rivera' },
  { id: 'chat-2', label: 'Chat with A. Kim' },
  { id: 'chat-3', label: 'Chat with M. Okafor' },
]

export const SEED_PROFILES: HelperUserProfile[] = [
  {
    chatId: 'chat-1', name: 'J. Rivera', status: 'Active now', userType: 'standard',
    currentProjectTitle: 'Coastal Line', currentBookTitle: 'Book Two: Undertow',
    activity: { wordCountTotal: 48210, wordCountGoal: 70000, chapterCount: 9, sceneCount: 41, lastActiveAt: '2026-08-20T09:14:00' },
  },
  {
    chatId: 'chat-2', name: 'A. Kim', status: 'Away · 3h ago', userType: 'admin',
    currentProjectTitle: 'Glasshouse', currentBookTitle: 'Book One: Foundations',
    activity: { wordCountTotal: 12870, wordCountGoal: 60000, chapterCount: 4, sceneCount: 15, lastActiveAt: '2026-08-19T18:02:00' },
  },
  {
    chatId: 'chat-3', name: 'M. Okafor', status: 'Active now', userType: 'standard',
    currentProjectTitle: 'The Long Season', currentBookTitle: 'Book Three: Harvest',
    activity: { wordCountTotal: 91340, wordCountGoal: 90000, chapterCount: 22, sceneCount: 88, lastActiveAt: '2026-08-20T10:47:00' },
  },
]

export const SEED_MESSAGES: HelperMessage[] = [
  // chat-1
  { id: 'msg-1', chatId: 'chat-1', sender: 'user', sentAt: '2026-08-19T14:02:00', kind: 'text',
    text: 'The editor keeps freezing when I paste in a big scene.' },
  { id: 'msg-2', chatId: 'chat-1', sender: 'admin', sentAt: '2026-08-19T14:10:00', kind: 'text',
    text: 'Sorry about that — can you tell me roughly how large a paste triggers it?' },
  { id: 'msg-3', chatId: 'chat-1', sender: 'admin', sentAt: '2026-08-19T14:12:00', kind: 'pageLink',
    text: 'In case it helps, here is where autosave settings live:',
    pageLink: { target: { page: 'Writer', component: 'Editor', feature: 'Autosave' } } },
  { id: 'msg-4', chatId: 'chat-1', sender: 'admin', sentAt: '2026-08-19T14:15:00', kind: 'form',
    text: 'Could you fill this out so we can reproduce it on our end?',
    form: { title: 'Editor freeze report', sent: true, fields: [
      { id: 'f1', label: 'Approx. paste size (words)', kind: 'text' },
      { id: 'f2', label: 'Browser / OS', kind: 'text' },
      { id: 'f3', label: 'Happens every time?', kind: 'checkbox' },
    ] } },
  // chat-2
  { id: 'msg-5', chatId: 'chat-2', sender: 'user', sentAt: '2026-08-18T09:00:00', kind: 'text',
    text: "I can't find where to change my shelf order." },
  { id: 'msg-6', chatId: 'chat-2', sender: 'admin', sentAt: '2026-08-18T09:05:00', kind: 'pageLink',
    text: 'Shelf ordering lives here:',
    pageLink: { target: { page: 'Writer', component: 'Sidebar', feature: 'Shelves' } } },
  { id: 'msg-7', chatId: 'chat-2', sender: 'user', sentAt: '2026-08-18T09:07:00', kind: 'text',
    text: 'Found it, thank you!' },
  // chat-3
  { id: 'msg-8', chatId: 'chat-3', sender: 'user', sentAt: '2026-08-20T08:30:00', kind: 'text',
    text: 'Search in the library never finds my own notes.' },
  { id: 'msg-9', chatId: 'chat-3', sender: 'admin', sentAt: '2026-08-20T08:40:00', kind: 'form',
    text: 'Mind sharing a search example that failed?',
    form: { title: 'Search relevance report', sent: true, fields: [
      { id: 'f1', label: 'Search term used', kind: 'text' },
      { id: 'f2', label: 'Expected result', kind: 'textarea' },
      { id: 'f3', label: 'Where were you searching?', kind: 'select', options: ['Library', 'Journal', 'Shelves'] },
    ] } },
  { id: 'msg-10', chatId: 'chat-3', sender: 'admin', sentAt: '2026-08-20T08:42:00', kind: 'pageLink',
    text: 'Also flagging this for your reference:',
    pageLink: { target: { page: 'Reader', component: 'Library', feature: 'Search' }, label: 'Library search' } },
]
