import type { FeedbackVote, MineView, MyMessage, StaffBundle, StaffMessage, Statement, VerbCategory } from './feedbackTypes'

// Builders for the feedback tests: a staff bundle, its messages and statements, and a user's own view.

export const VERBS: VerbCategory[] = [
  { id: 'verb-fix', name: 'Fix', keywords: ['broken'] },
  { id: 'verb-add', name: 'Add', keywords: ['missing'] },
  { id: 'verb-increase', name: 'Increase', keywords: [] },
]

export function vote(over: Partial<FeedbackVote> = {}): FeedbackVote {
  return { mine: false, approve: false, deny: false, passed: false, approveNote: '', denyNote: '', passNote: '', updatedAt: '', ...over }
}

export function staffMessage(id: string, over: Partial<StaffMessage> = {}): StaffMessage {
  return {
    id, text: `Message ${id}`, submittedAt: '2026-08-10', senderTone: null, channelId: 'writer/draft/draft', verbId: 'verb-fix',
    fromChannel: 'writer/draft', tone: null, checked: false, checkedAt: null, checkedByMe: false, statementId: null,
    questions: [], comments: [], flags: [], status: 'received', history: [], ...over,
  }
}

export function statement(id: string, messageIds: string[], over: Partial<Statement> = {}): Statement {
  return {
    id, key: `writer/draft/draft::verb-fix`, channelId: 'writer/draft/draft', verbId: 'verb-fix', verbName: 'Fix', messageIds,
    tone: { category: null, pleasant: 0, unpleasant: 0, neutral: 0, n: 0 }, votes: [], tally: { approve: 0, deny: 0, pass: 0 },
    decision: null, decisionNote: '', decidedAt: null, work: null, history: [], can: { vote: true, correct: true, decide: true }, ...over,
  }
}

export function staffBundle(over: Partial<StaffBundle> = {}): StaffBundle {
  return {
    me: 'adm-dana',
    admins: [
      { id: 'adm-dana', name: 'Dana Ruiz', roles: { 'helper/inbox': ['checker', 'channelManager'], 'writer/draft': ['voter', 'channelManager', 'planner'] } },
      { id: 'adm-lee', name: 'Lee Park', roles: { 'helper/inbox': ['checker'] } },
    ],
    verbCategories: VERBS, messages: [], statements: [], roleHistory: [], can: { check: true, manageVerbs: true }, ...over,
  }
}

export function myMessage(id: string, over: Partial<MyMessage> = {}): MyMessage {
  return {
    id, text: `Mine ${id}`, submittedAt: '2026-08-10T10:00:00Z', senderTone: null, channelId: 'writer/draft/draft', verbId: 'verb-fix',
    verbName: 'Fix', status: 'received', steps: [{ step: 'received', at: '2026-08-10T10:00:00Z' }], note: '', questions: [], ...over,
  }
}

export const mineView = (messages: MyMessage[]): MineView => ({
  messages, openQuestions: messages.reduce((n, m) => n + m.questions.filter(q => !q.answer).length, 0),
})
