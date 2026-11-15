// The feedback pipeline's data, as the backend sends it (backend/app/storage/feedback.py). A user writes a statement in a
// Help tile (a subject: a node of the channel list, and a verb); a helper checks it in the Inbox; admins vote on and correct
// statements in the Office; the planner of the statement's console accepts or vetoes it in the Project Plan.

export type Tone = 'pleasant' | 'unpleasant' | 'mixed' | 'neutral'
export type ToneCategory = 'pleasant' | 'mixedPleasant' | 'neutral' | 'mixed' | 'mixedUnpleasant' | 'unpleasant'
export type Role = 'checker' | 'voter' | 'channelManager' | 'planner'
export type Decision = 'accepted' | 'vetoed'
export type FeedbackStatus = 'received' | 'voting' | 'planned' | 'inProgress' | 'done' | 'declined'
export type WorkStatus = 'planned' | 'inProgress' | 'done' | null

export interface VerbCategory { id: string; name: string; keywords: string[] }
export interface KeywordFlag { categoryId: string; keyword: string; start: number; end: number }
export interface ToneSummary { category: ToneCategory | null; pleasant: number; unpleasant: number; neutral: number; n: number }
export interface HistoryEntry { at: string; kind: string; detail: string; mine: boolean }

export interface FeedbackQuestion {
  id: string
  text: string
  at: string
  answer: string
  answeredAt: string | null
  // Staff only: asked by the admin acting now.
  mine?: boolean
}
export interface FeedbackComment { id: string; text: string; at: string; mine: boolean }

// A message as staff see it (no writer's name).
export interface StaffMessage {
  id: string
  text: string
  submittedAt: string
  senderTone: Tone | null
  channelId: string
  verbId: string
  fromChannel: string | null
  tone: Tone | null
  checked: boolean
  checkedAt: string | null
  checkedByMe: boolean
  statementId: string | null
  questions: FeedbackQuestion[]
  comments: FeedbackComment[]
  flags: KeywordFlag[]
  status: FeedbackStatus
  history: HistoryEntry[]
}

export interface FeedbackVote {
  mine: boolean
  approve: boolean
  deny: boolean
  passed: boolean
  approveNote: string
  denyNote: string
  passNote: string
  updatedAt: string
}
export type VoteInput = Pick<FeedbackVote, 'approve' | 'deny' | 'passed' | 'approveNote' | 'denyNote' | 'passNote'>

export interface Statement {
  id: string
  key: string
  channelId: string
  verbId: string
  verbName: string
  messageIds: string[]
  tone: ToneSummary
  votes: FeedbackVote[]
  tally: { approve: number; deny: number; pass: number }
  decision: Decision | null
  decisionNote: string
  decidedAt: string | null
  work: WorkStatus
  history: HistoryEntry[]
  can: { vote: boolean; correct: boolean; decide: boolean }
}

export interface FeedbackAdmin { id: string; name: string; roles: Record<string, Role[]> }

export interface StaffBundle {
  me: string
  admins: FeedbackAdmin[]
  verbCategories: VerbCategory[]
  messages: StaffMessage[]
  statements: Statement[]
  roleHistory: HistoryEntry[]
  can: { check: boolean; manageVerbs: boolean }
}

// What a user sent, as they see it.
export interface StatusStep { step: 'received' | 'checked' | 'voting' | 'planned' | 'inProgress' | 'done' | 'declined'; at: string | null }
export interface MyMessage {
  id: string
  text: string
  submittedAt: string
  senderTone: Tone | null
  channelId: string
  verbId: string
  verbName: string
  status: FeedbackStatus
  steps: StatusStep[]
  note: string
  questions: FeedbackQuestion[]
}
export interface MineView { messages: MyMessage[]; openQuestions: number }

export interface SendInput {
  author: string
  authorId: string
  text: string
  senderTone: Tone | null
  channelId: string
  verbId: string
  fromChannel: string | null
}

export interface MessageEdit { channelId?: string; verbId?: string; tone?: Tone; checked?: boolean }
