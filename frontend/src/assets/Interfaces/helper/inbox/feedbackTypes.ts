import type { Tone } from '../helperTypes'

// The Inbox bundle the backend returns (backend/app/storage/feedback.py `bundle`), one per
// signed-in admin. Every mutation returns a fresh bundle.

export type ToneBand = 'mostlyPleasant' | 'slightlyPleasant' | 'neutral' | 'slightlyUnpleasant' | 'mostlyUnpleasant'
export type CaseStatus = 'open' | 'approved' | 'rejected'

export interface FeedbackChannel { page: string; console: string; component: string; feature: string }
export interface FeedbackStatement { channel: FeedbackChannel; verbId: string }

export interface TaxonomyComponent { name: string; features: string[] }
export interface TaxonomyConsole { name: string; components: TaxonomyComponent[] }
export interface TaxonomyPage { name: string; consoles: TaxonomyConsole[] }

export interface VerbCategory { id: string; name: string; keywords: string[] }

export interface FeedbackAdmin {
  id: string
  name: string
  processing: string[]
  configuration: string[]
  projectPlan: string[]
}

export interface ToneSummary { net: number; count: number; band: ToneBand }

export interface KeywordFlag { categoryId: string; keyword: string; start: number; end: number }

export interface AdminValidation {
  adminId: string
  tone: Tone | null
  channels: FeedbackChannel[]
  statements: FeedbackStatement[]
  complete: boolean
}

export interface FeedbackMessage {
  id: string
  text: string
  author: string
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
  tone: ToneSummary
  reconciled: {
    complete: number
    required: number
    atQuorum: boolean
    channels: FeedbackChannel[]
    statements: FeedbackStatement[]
  }
}

export interface FeedbackVote {
  adminId: string
  approve: boolean
  deny: boolean
  approveNote: string
  denyNote: string
  updatedAt: string
}

export interface FeedbackSolution {
  id: string
  title: string
  description: string
  target: FeedbackChannel
  proposedBy: string
  createdAt: string
  votes: FeedbackVote[]
}

export interface CaseMessage {
  messageId: string
  text: string
  author: string
  submittedAt: string
  senderTone: Tone | null
  tone: ToneSummary
}

export interface HistoryEvent { at: string; adminId: string; kind: string; detail: string }

export interface StatementCase {
  id: string
  key: string
  channel: FeedbackChannel
  verbId: string
  verbName: string
  status: CaseStatus
  messages: CaseMessage[]
  votes: FeedbackVote[]
  solutions: FeedbackSolution[]
  closedBy: string | null
  closedAt: string | null
  closeNote: string
  history: HistoryEvent[]
  can: { vote: boolean; propose: boolean; close: boolean; reopen: boolean }
}

export interface InboxBundle {
  me: string
  admins: FeedbackAdmin[]
  requiredValidations: number
  taxonomy: TaxonomyPage[]
  verbCategories: VerbCategory[]
  messages: MessageView[]
  cases: StatementCase[]
  can: { validate: boolean; manageVerbs: boolean }
}

export interface VoteInput { approve: boolean; deny: boolean; approveNote: string; denyNote: string }
