import type { Tone } from '../helperTypes'

// The Inbox bundle the backend returns (backend/app/storage/feedback.py `bundle`), one per
// signed-in admin. Every mutation returns a fresh bundle. The Inbox is anonymous: nothing here
// names an author or another admin; your own items are marked `mine`.

export type ToneCategory = 'pleasant' | 'mixedPleasant' | 'neutral' | 'mixed' | 'mixedUnpleasant' | 'unpleasant'
export type CaseStatus = 'open' | 'approved' | 'rejected'
export type Role = 'processor' | 'configurer' | 'planner'

export interface FeedbackChannel { page: string; console: string; component: string; feature: string }
export interface FeedbackStatement { channel: FeedbackChannel; verbId: string }

export interface TaxonomyComponent { name: string; features: string[] }
export interface TaxonomyConsole { name: string; components: TaxonomyComponent[] }
export interface TaxonomyPage { name: string; consoles: TaxonomyConsole[] }

export interface VerbCategory { id: string; name: string; keywords: string[] }

// An admin as the sign-in menu and the role assignment screen list them. `roles` is keyed "Page/Console".
export interface FeedbackAdmin { id: string; name: string; roles: Record<string, Role[]> }

// Votes and validators counted across every response: a mixed response is one pleasant and one unpleasant vote.
export interface ToneSummary { category: ToneCategory | null; pleasant: number; unpleasant: number; neutral: number; n: number }

export interface KeywordFlag { categoryId: string; keyword: string; start: number; end: number }

export interface AdminValidation {
  mine: boolean
  // Other validators' labels are only sent to Configurers.
  tone: Tone | null
  toneSet: boolean
  channels: FeedbackChannel[]
  statements: FeedbackStatement[]
  complete: boolean
}

// Every subject any validator chose, with how many chose it and each verb (most common first).
export interface Selection {
  channel: FeedbackChannel
  chosenBy: number
  verbs: Array<{ verbId: string; chosenBy: number }>
}

export interface HistoryEvent { at: string; kind: string; detail: string; mine: boolean }

export interface FeedbackMessage {
  id: string
  text: string
  submittedAt: string
  senderTone: Tone | null
  openPage: string | null
  openConsole: string | null
  selectedComponent: string | null
}

export interface MessageView {
  message: FeedbackMessage
  flags: KeywordFlag[]
  validations: AdminValidation[]
  selections: Selection[]
  tone: ToneSummary
  validationCount: number
  joined: boolean
  history: HistoryEvent[]
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

export interface FeedbackSolution {
  id: string
  title: string
  description: string
  target: FeedbackChannel
  mine: boolean
  createdAt: string
  votes: FeedbackVote[]
}

export interface CaseMessage { messageId: string; text: string; submittedAt: string; senderTone: Tone | null; tone: ToneSummary }

export interface StatementCase {
  id: string
  key: string
  channel: FeedbackChannel
  verbId: string
  verbName: string
  status: CaseStatus
  messages: CaseMessage[]
  tone: ToneSummary
  validators: number
  votes: FeedbackVote[]
  solutions: FeedbackSolution[]
  closedAt: string | null
  closeNote: string
  history: HistoryEvent[]
  can: { vote: boolean; propose: boolean; close: boolean; reopen: boolean }
}

export interface InboxBundle {
  me: string
  admins: FeedbackAdmin[]
  consoles: string[]
  taxonomy: TaxonomyPage[]
  verbCategories: VerbCategory[]
  messages: MessageView[]
  cases: StatementCase[]
  roleHistory: HistoryEvent[]
  can: { validate: boolean; manageVerbs: boolean; seeTones: boolean }
}

export interface VoteInput {
  approve: boolean
  deny: boolean
  passed: boolean
  approveNote: string
  denyNote: string
  passNote: string
}
