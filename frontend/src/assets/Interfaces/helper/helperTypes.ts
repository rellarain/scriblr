export type MessageSender = 'user' | 'admin'
export type HelperMessageKind = 'text' | 'form' | 'pageLink'
export type FormFieldKind = 'text' | 'textarea' | 'select' | 'checkbox'

// Replaces SidebarDivider's local MockChat — one per chat head.
export interface HelperConversation {
  id: string
  label: string
}

export type HelperUserType = 'admin' | 'standard'

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

export interface FormFieldDef {
  id: string
  label: string
  kind: FormFieldKind
  options?: string[] // only meaningful when kind === 'select'
}

export interface HelperFormPayload {
  title: string
  fields: FormFieldDef[]
  sent: boolean
}

// A link to a place in the app: a node of the channel list (channels/channelStore.ts).
export interface HelperPageLink {
  channelId: string
  label?: string
}

export interface HelperMessage {
  id: string
  chatId: string
  sender: MessageSender
  sentAt: string
  kind: HelperMessageKind
  text?: string
  form?: HelperFormPayload
  pageLink?: HelperPageLink
}

export const FORM_FIELD_KINDS: Array<{ key: FormFieldKind; label: string }> = [
  { key: 'text', label: 'Short text' },
  { key: 'textarea', label: 'Long text' },
  { key: 'select', label: 'Dropdown' },
  { key: 'checkbox', label: 'Checkbox' },
]

// The tone a feedback message is written in (the sender's own, or a helper's reading of it).
export type Tone = 'pleasant' | 'unpleasant' | 'mixed' | 'neutral'
