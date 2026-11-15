// Support chats (backend storage/support.py, /api/support). A user starts one from a Help tile; it waits in that console's queue
// until a staff member takes it.

import type { Tone } from '../feedback/feedbackTypes'

export type ChatStage = 'greeting' | 'issue' | 'acknowledgement' | 'solution' | 'resolution' | 'closing'
export type ChatStatus = 'pending' | 'active' | 'closed'
export type EventKind =
  | 'userMessage' | 'helperMessage' | 'adminMessage' | 'greeting' | 'resource' | 'feedbackInitiated' | 'feedbackConfirmed'
  | 'escalation' | 'transfer' | 'checkIn' | 'hold' | 'stage' | 'focal' | 'taken' | 'closed'
export type StaffAction = 'greeting' | 'checkIn' | 'hold' | 'stage' | 'focal' | 'resource' | 'feedbackInitiated' | 'transfer' | 'escalation' | 'closed'

export interface ChatDraft { channelId: string; verbId: string; text: string; tone: Tone | null; confirmed: boolean; messageId: string | null }

export interface ChatEvent {
  id: string
  at: string
  kind: EventKind
  by: 'user' | 'staff' | 'system'
  staffId: string
  text: string
  nodeId: string | null
  draft: ChatDraft | null
  toQueue: string | null
  toTier: number | null
  stage: ChatStage | null
}

export interface Chat {
  id: string
  userId: string
  userName: string
  // The console whose queue it is in.
  queue: string
  // The feature it is about.
  focal: string
  tier: number
  staffId: string
  status: ChatStatus
  stage: ChatStage
  createdAt: string
  waitingSince: string
  events: ChatEvent[]
}

// A chat in progress with someone else: no messages, the kinds of what staff did instead.
export type ChatSummary = Omit<Chat, 'events'> & { actions: EventKind[] }

export interface StaffChatView { me: string; waiting: Chat[]; mine: Chat[]; others: ChatSummary[]; closed: Chat[] }
export interface UserChatView { chats: Chat[] }

export interface ActionInput {
  action: StaffAction
  text?: string
  nodeId?: string
  stage?: ChatStage
  toQueue?: string
  draft?: { channelId: string; verbId: string; text: string; tone: Tone | null }
}

export const STAGE_LABEL: Record<ChatStage, string> = {
  greeting: 'Greeting', issue: 'Presentation of the issue', acknowledgement: 'Acknowledgement', solution: 'Solution', resolution: 'Resolution', closing: 'Closing',
}
export const STAGES: ChatStage[] = ['greeting', 'issue', 'acknowledgement', 'solution', 'resolution', 'closing']
export const EVENT_LABEL: Record<EventKind, string> = {
  userMessage: 'Message', helperMessage: 'Helper message', adminMessage: 'Admin message', greeting: 'Greeting', resource: 'Guide',
  feedbackInitiated: 'Feedback drafted', feedbackConfirmed: 'Feedback sent', escalation: 'Escalated', transfer: 'Transferred',
  checkIn: 'Check-in', hold: 'On hold', stage: 'Stage', focal: 'Feature', taken: 'Taken', closed: 'Closed',
}
