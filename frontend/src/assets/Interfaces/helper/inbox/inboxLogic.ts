import type {
  AdminValidation, FeedbackChannel, FeedbackVote, KeywordFlag, MessageView, StatementCase, ToneCategory,
} from './feedbackTypes'

// Pure helpers behind the Inbox: tone categories, stage progress, the message and case queues, and
// the "needs your vote" count.

export type Stage = 'tone' | 'explicate'
export const STAGES: Stage[] = ['tone', 'explicate']

// The fixed order tone categories are listed and sorted in, most pleasant first.
export const TONE_CATEGORIES: ToneCategory[] = ['pleasant', 'mixedPleasant', 'neutral', 'mixed', 'mixedUnpleasant', 'unpleasant']
export const CATEGORY_LABEL: Record<ToneCategory, string> = {
  pleasant: 'Pleasant', mixedPleasant: 'Mixed-leaning pleasant', neutral: 'Neutral', mixed: 'Mixed',
  mixedUnpleasant: 'Mixed-leaning unpleasant', unpleasant: 'Unpleasant',
}
const categoryRank = (c: ToneCategory | null) => (c === null ? TONE_CATEGORIES.length : TONE_CATEGORIES.indexOf(c))

export const channelLabel = (c: FeedbackChannel) => [c.page, c.console, c.component, c.feature].filter(Boolean).join(' > ')
// The levels above the most specific one, for the small text row over a subject.
export const channelAncestors = (c: FeedbackChannel) => [c.page, c.console, c.component].filter(Boolean)
export const sameChannel = (a: FeedbackChannel, b: FeedbackChannel) =>
  a.page === b.page && a.console === b.console && a.component === b.component && a.feature === b.feature

export function myValidation(view: MessageView): AdminValidation | undefined {
  return view.validations.find(v => v.mine)
}

// Whether this admin has finished one stage of a message.
export function stageDone(view: MessageView, stage: Stage): boolean {
  const v = myValidation(view)
  if (!v) return false
  if (stage === 'tone') return v.toneSet
  return v.channels.length > 0 && v.channels.every(c => v.statements.some(s => sameChannel(s.channel, c)))
}

// Explicate opens once the message has been toned.
export const stageLocked = (view: MessageView, stage: Stage): boolean => stage === 'explicate' && !stageDone(view, 'tone')

// The unfinished count and total per stage, for the tab progress bars.
export function stageCounts(views: MessageView[]): Record<Stage, { count: number; total: number }> {
  const out = {} as Record<Stage, { count: number; total: number }>
  for (const stage of STAGES) out[stage] = { count: views.filter(v => !stageDone(v, stage)).length, total: views.length }
  return out
}

export const messageDone = (view: MessageView) => STAGES.every(s => stageDone(view, s))

export type MessageSort = 'tone' | 'fewest' | 'most'

// Messages in a fixed order: by tone category (most pleasant first) then oldest first; Configurers can instead
// sort by how many validators have completed a message.
export function orderMessages(views: MessageView[], sort: MessageSort = 'tone'): MessageView[] {
  return [...views].sort((a, b) => {
    if (sort === 'fewest' && a.validationCount !== b.validationCount) return a.validationCount - b.validationCount
    if (sort === 'most' && a.validationCount !== b.validationCount) return b.validationCount - a.validationCount
    return categoryRank(a.tone.category) - categoryRank(b.tone.category)
      || a.message.submittedAt.localeCompare(b.message.submittedAt) || a.message.id.localeCompare(b.message.id)
  })
}

// Keeps a queue from reshuffling while it is worked through: the ids in `known` keep their places, new
// messages are appended in the order they would have had.
export function stableOrder(fresh: MessageView[], known: string[]): MessageView[] {
  const byId = new Map(fresh.map(v => [v.message.id, v]))
  const kept = known.map(id => byId.get(id)).filter((v): v is MessageView => Boolean(v))
  const keptIds = new Set(kept.map(v => v.message.id))
  return [...kept, ...fresh.filter(v => !keptIds.has(v.message.id))]
}

// The first message (from `from`, wrapping round) this admin has not toned yet, or -1.
export function firstUntoned(ordered: MessageView[], from = 0): number {
  for (let step = 0; step < ordered.length; step += 1) {
    const i = (from + step) % ordered.length
    if (!stageDone(ordered[i], 'tone')) return i
  }
  return -1
}

export function tally(votes: FeedbackVote[]): { approve: number; deny: number; passed: number } {
  return { approve: votes.filter(v => v.approve).length, deny: votes.filter(v => v.deny).length, passed: votes.filter(v => v.passed).length }
}

const voted = (votes: FeedbackVote[]) => votes.some(v => v.mine && (v.approve || v.deny || v.passed))

// Statements and solutions this admin can vote on and has not voted on yet.
export function needsMyVoteCount(cases: StatementCase[]): number {
  let n = 0
  for (const c of cases) {
    if (c.status !== 'open' || !c.can.vote) continue
    if (!voted(c.votes)) n += 1
    n += c.solutions.filter(s => !voted(s.votes)).length
  }
  return n
}

export const needsMyVote = (c: StatementCase) => needsMyVoteCount([c]) > 0

export type CaseView = 'all' | 'needs' | 'open' | 'closed'
export type CaseSort = 'newest' | 'votes' | 'page'

export function filterCases(cases: StatementCase[], view: CaseView, category: ToneCategory | ''): StatementCase[] {
  return cases.filter(c => {
    if (category && c.tone.category !== category) return false
    if (view === 'needs') return needsMyVote(c)
    if (view === 'open') return c.status === 'open'
    if (view === 'closed') return c.status !== 'open'
    return true
  })
}

const newestMessage = (c: StatementCase) => c.messages.reduce((latest, m) => (m.submittedAt > latest ? m.submittedAt : latest), '')

export function sortCases(cases: StatementCase[], sort: CaseSort): StatementCase[] {
  const votes = (c: StatementCase) => c.votes.length + c.solutions.reduce((n, s) => n + s.votes.length, 0)
  return [...cases].sort((a, b) => {
    if (sort === 'votes') return votes(b) - votes(a) || newestMessage(b).localeCompare(newestMessage(a))
    if (sort === 'page') return channelLabel(a.channel).localeCompare(channelLabel(b.channel))
    return newestMessage(b).localeCompare(newestMessage(a)) || a.id.localeCompare(b.id)
  })
}

export function statusLabel(c: StatementCase): string {
  return c.status === 'open' ? 'Open' : c.status === 'approved' ? 'Approved' : 'Rejected'
}

// Splits a message into plain and keyword-flagged pieces (earlier, longer flags win over overlapping ones).
export interface TextSegment { text: string; flag?: KeywordFlag }
export function segmentText(text: string, flags: KeywordFlag[]): TextSegment[] {
  const out: TextSegment[] = []
  let at = 0
  for (const flag of flags) {
    if (flag.start < at) continue
    if (flag.start > at) out.push({ text: text.slice(at, flag.start) })
    out.push({ text: text.slice(flag.start, flag.end), flag })
    at = flag.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

// "DR" for Dana Ruiz: the sign-in chip (testing only).
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}
