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

// `next`: the chat the staff member would take next from the queues that are on for them (queues.py), or null.
export interface StaffChatView { me: string; waiting: Chat[]; mine: Chat[]; others: ChatSummary[]; closed: Chat[]; next: string | null }
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

// --- the queues (backend storage/queues.py) ---------------------------------------------------------------------------------

export type QueueLevel = 'low' | 'medium' | 'high' | 'urgent'
export const LEVELS: QueueLevel[] = ['low', 'medium', 'high', 'urgent']
export const LEVEL_LABEL: Record<QueueLevel, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
// required: the level asks for this tier; on / off: optional, as the person chose; unavailable: no helper time now.
export type SwitchState = 'required' | 'on' | 'off' | 'unavailable'

export interface ScheduleBlock { day: number; start: number; hours: number }
// A week of helper time: `own` false when the week repeats the latest schedule before it.
export interface ScheduleWeek { start: string; blocks: ScheduleBlock[]; hours: number; own: boolean }
export interface LevelRanges { medium: number; high: number; urgent: number }

export interface QueueStaff { id: string; name: string; tier: number; state: 'active' | 'idle' | 'inactive' }
export interface QueueChat { id: string; staffId: string; staffName: string; userName: string; focal: string; stage: ChatStage; tier: number; createdAt: string; actions: EventKind[] }
export interface QueueWaiting { id: string; userName: string; focal: string; tier: number; waitingSince: string }

export interface QueueRow {
  id: string
  pending: number
  level: QueueLevel
  autoLevel: QueueLevel
  override: { level: QueueLevel; until: string } | null
  ranges: LevelRanges
  ownRanges: boolean
  // null: no tier on this console (not on the switchboard).
  myTier: number | null
  myState: SwitchState | null
  // The person is this queue's channel support (sets its levels).
  canManage: boolean
  // Admins only (empty for helpers): who is on it, the chats in progress (never their messages), who is waiting.
  staff: QueueStaff[]
  chats: QueueChat[]
  waiting: QueueWaiting[]
}

export interface PersonWeeks { id: string; thisWeek: ScheduleWeek; nextWeek: ScheduleWeek }

export interface QueueView {
  me: { id: string; name: string; kind: 'helper' | 'admin'; allotment: number | null; onShift: boolean; thisWeek: ScheduleWeek; nextWeek: ScheduleWeek; managesAny: boolean }
  // Today, Monday 0.
  today: number
  // Everyone's helper time this week and next (each active person with helper hours; admins only: the Office's Schedule tabs).
  weeks: PersonWeeks[]
  levels: LevelRanges
  queues: QueueRow[]
  next: string | null
}

export const DAY_LABEL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
