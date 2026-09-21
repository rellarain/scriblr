import type { Tone } from '../helperTypes'
import type {
  AdminValidation, FeedbackChannel, FeedbackVote, InboxBundle, MessageView, Selection, StatementCase, ToneCategory, ToneSummary,
} from './feedbackTypes'

// Small builders for the Inbox tests.

export const SPINES: FeedbackChannel = { page: 'Writer', console: 'Shelf', component: 'Sidebar Shelf', feature: 'Book Spines' }
export const SEARCH: FeedbackChannel = { page: 'Reader', console: 'Library', component: 'Browse', feature: 'Search' }
export const SHELVES: FeedbackChannel = { page: 'Reader', console: 'Library', component: 'Browse', feature: 'Shelves' }

export const TAXONOMY = [
  { name: 'Reader', consoles: [{ name: 'Library', components: [{ name: 'Browse', features: ['Search', 'Shelves'] }] }] },
  { name: 'Writer', consoles: [{ name: 'Shelf', components: [{ name: 'Sidebar Shelf', features: ['Book Spines'] }] }] },
]

export const VERBS = [
  { id: 'verb-fix', name: 'Fix', keywords: ['freezes'] },
  { id: 'verb-increase', name: 'Increase', keywords: ['brighter'] },
]

// One admin's validation. `mine` marks the signed-in admin's own.
export function validation(over: Partial<AdminValidation> = {}): AdminValidation {
  return { mine: true, tone: null, toneSet: false, channels: [], statements: [], complete: false, ...over }
}

// A validation with everything filled in.
export function doneValidation(over: Partial<AdminValidation> = {}): AdminValidation {
  return validation({
    tone: 'pleasant', toneSet: true, channels: [SPINES], statements: [{ channel: SPINES, verbId: 'verb-fix' }], complete: true, ...over,
  })
}

export function tone(category: ToneCategory | null = 'neutral', pleasant = 0, unpleasant = 0, neutral = 0): ToneSummary {
  return { category, pleasant, unpleasant, neutral, n: category === null ? 0 : Math.max(1, pleasant + unpleasant + neutral) }
}

const same = (a: FeedbackChannel, b: FeedbackChannel) => a.feature === b.feature && a.component === b.component

// Every subject and verb the validations chose, with counts.
export function selectionsOf(validations: AdminValidation[]): Selection[] {
  const out: Selection[] = []
  for (const v of validations) {
    for (const c of v.channels) {
      const entry = out.find(s => same(s.channel, c)) ?? (out[out.push({ channel: c, chosenBy: 0, verbs: [] }) - 1])
      entry.chosenBy += 1
    }
    for (const st of v.statements) {
      const entry = out.find(s => same(s.channel, st.channel))
      const verb = entry?.verbs.find(x => x.verbId === st.verbId)
      if (verb) verb.chosenBy += 1
      else entry?.verbs.push({ verbId: st.verbId, chosenBy: 1 })
    }
  }
  return out
}

export function message(id: string, over: {
  text?: string; category?: ToneCategory | null; date?: string; validations?: AdminValidation[]; senderTone?: Tone | null; count?: number
} = {}): MessageView {
  const validations = over.validations ?? []
  return {
    message: {
      id, text: over.text ?? `Message ${id}`, submittedAt: over.date ?? '2026-08-10', senderTone: over.senderTone ?? 'neutral',
      openPage: 'Writer', openConsole: 'Shelf', selectedComponent: 'Sidebar Shelf',
    },
    flags: [],
    validations,
    selections: selectionsOf(validations),
    tone: tone(over.category === undefined ? 'neutral' : over.category),
    validationCount: over.count ?? validations.filter(v => v.complete).length,
    joined: validations.some(v => v.complete),
    history: [],
  }
}

export function vote(over: Partial<FeedbackVote> = {}): FeedbackVote {
  return { mine: false, approve: false, deny: false, passed: false, approveNote: '', denyNote: '', passNote: '', updatedAt: '', ...over }
}

export function statementCase(id: string, over: Partial<StatementCase> = {}): StatementCase {
  return {
    id, key: id, channel: SPINES, verbId: 'verb-increase', verbName: 'Increase', status: 'open',
    messages: [{ messageId: 'm1', text: 'Icons are dim', submittedAt: '2026-08-11', senderTone: 'unpleasant', tone: tone('mixedUnpleasant', 0, 2, 1) }],
    tone: tone('mixedUnpleasant', 0, 2, 1), validators: 3, votes: [], solutions: [], closedAt: null, closeNote: '', history: [],
    can: { vote: true, propose: true, close: true, reopen: true },
    ...over,
  }
}

export function bundle(over: Partial<InboxBundle> = {}): InboxBundle {
  return {
    me: 'adm-dana',
    admins: [
      { id: 'adm-dana', name: 'Dana Ruiz', roles: { 'Helper/Inbox': ['processor', 'configurer'] } },
      { id: 'adm-lee', name: 'Lee Park', roles: { 'Helper/Inbox': ['processor'] } },
    ],
    consoles: ['Helper/Inbox', 'Writer/Shelf'],
    taxonomy: TAXONOMY,
    verbCategories: VERBS,
    messages: [],
    cases: [],
    roleHistory: [],
    can: { validate: true, manageVerbs: true, seeTones: false },
    ...over,
  }
}
