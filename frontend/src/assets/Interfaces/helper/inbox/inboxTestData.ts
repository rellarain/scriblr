import type { Tone } from '../helperTypes'
import type {
  AdminValidation, FeedbackChannel, InboxBundle, MessageView, StatementCase, ToneBand, ToneSummary,
} from './feedbackTypes'

// Small builders for the Inbox tests.

export const SPINES: FeedbackChannel = { page: 'Writer', console: 'Shelf', component: 'Sidebar Shelf', feature: 'Book Spines' }
export const SEARCH: FeedbackChannel = { page: 'Reader', console: 'Library', component: 'Browse', feature: 'Search' }

export const TAXONOMY = [
  { name: 'Reader', consoles: [{ name: 'Library', components: [{ name: 'Browse', features: ['Search', 'Shelves'] }] }] },
  { name: 'Writer', consoles: [{ name: 'Shelf', components: [{ name: 'Sidebar Shelf', features: ['Book Spines'] }] }] },
]

export const VERBS = [
  { id: 'verb-fix', name: 'Fix', keywords: ['freezes'] },
  { id: 'verb-increase', name: 'Increase', keywords: ['brighter'] },
]

export function validation(adminId: string, over: Partial<AdminValidation> = {}): AdminValidation {
  return { adminId, tone: null, channels: [], statements: [], complete: false, ...over }
}

export function tone(band: ToneBand = 'neutral', net = 0, count = 1): ToneSummary { return { net, count, band } }

export function message(id: string, over: { text?: string; band?: ToneBand; date?: string; validations?: AdminValidation[]; senderTone?: Tone | null } = {}): MessageView {
  return {
    message: {
      id, text: over.text ?? `Message ${id}`, author: 'a.kim', submittedAt: over.date ?? '2026-08-10', senderTone: over.senderTone ?? 'neutral',
      openPage: 'Writer', openConsole: 'Shelf', selectedComponent: 'Sidebar Shelf',
    },
    flags: [],
    validations: over.validations ?? [],
    tone: tone(over.band ?? 'neutral'),
    reconciled: { complete: 0, required: 3, atQuorum: false, channels: [], statements: [] },
  }
}

export function statementCase(id: string, over: Partial<StatementCase> = {}): StatementCase {
  return {
    id, key: id, channel: SPINES, verbId: 'verb-increase', verbName: 'Increase', status: 'open',
    messages: [{ messageId: 'm1', text: 'Icons are dim', author: 'a.kim', submittedAt: '2026-08-11', senderTone: 'unpleasant', tone: tone('slightlyUnpleasant', -1, 3) }],
    votes: [], solutions: [], closedBy: null, closedAt: null, closeNote: '', history: [],
    can: { vote: true, propose: true, close: true, reopen: true },
    ...over,
  }
}

export function bundle(over: Partial<InboxBundle> = {}): InboxBundle {
  return {
    me: 'adm-dana',
    admins: [
      { id: 'adm-dana', name: 'Dana Ruiz', processing: ['Helper/Inbox'], configuration: [], projectPlan: [] },
      { id: 'adm-lee', name: 'Lee Park', processing: ['Helper/Inbox'], configuration: [], projectPlan: [] },
    ],
    requiredValidations: 3,
    taxonomy: TAXONOMY,
    verbCategories: VERBS,
    messages: [],
    cases: [],
    can: { validate: true, manageVerbs: true },
    ...over,
  }
}
