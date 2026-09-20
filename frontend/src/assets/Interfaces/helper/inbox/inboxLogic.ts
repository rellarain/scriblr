import type {
  AdminValidation, FeedbackChannel, InboxBundle, KeywordFlag, MessageView, StatementCase, ToneBand, ToneSummary, FeedbackVote,
} from './feedbackTypes'

// Pure helpers behind the Inbox: tone bands, per-admin stage progress, the case and
// message queues, and the "needs your vote" count.

export type Stage = 'tone' | 'channel' | 'explicate'
export const STAGES: Stage[] = ['tone', 'channel', 'explicate']

export const TONE_BANDS: ToneBand[] = ['mostlyPleasant', 'slightlyPleasant', 'neutral', 'slightlyUnpleasant', 'mostlyUnpleasant']
export const BAND_LABEL: Record<ToneBand, string> = {
  mostlyPleasant: 'Mostly pleasant', slightlyPleasant: 'Slightly pleasant', neutral: 'Neutral',
  slightlyUnpleasant: 'Slightly unpleasant', mostlyUnpleasant: 'Mostly unpleasant',
}

// The score over every response, e.g. "1/3": net (pleasant minus unpleasant) over the number of responses.
export function toneScoreLabel(t: ToneSummary): string {
  return t.count === 0 ? 'no responses' : `${t.net}/${t.count}`
}

export const channelLabel = (c: FeedbackChannel) => [c.page, c.console, c.component, c.feature].filter(Boolean).join(' > ')
export const sameChannel = (a: FeedbackChannel, b: FeedbackChannel) =>
  a.page === b.page && a.console === b.console && a.component === b.component && a.feature === b.feature

export function myValidation(view: MessageView, adminId: string): AdminValidation | undefined {
  return view.validations.find(v => v.adminId === adminId)
}

// Whether this admin has finished one stage of a message.
export function stageDone(view: MessageView, adminId: string, stage: Stage): boolean {
  const v = myValidation(view, adminId)
  if (!v) return false
  if (stage === 'tone') return v.tone !== null
  if (stage === 'channel') return v.channels.length > 0
  return v.channels.length > 0 && v.channels.every(c => v.statements.some(s => sameChannel(s.channel, c)))
}

// The unfinished count and total per stage, for the tab progress bars.
export function stageCounts(views: MessageView[], adminId: string): Record<Stage, { count: number; total: number }> {
  const out = {} as Record<Stage, { count: number; total: number }>
  for (const stage of STAGES) {
    out[stage] = { count: views.filter(v => !stageDone(v, adminId, stage)).length, total: views.length }
  }
  return out
}

// Messages in the admin-defined tone priority (the most important band first), oldest first within a band.
export function orderMessages(views: MessageView[], order: ToneBand[]): MessageView[] {
  const rank = (band: ToneBand) => { const i = order.indexOf(band); return i === -1 ? order.length : i }
  return [...views].sort((a, b) =>
    rank(a.tone.band) - rank(b.tone.band) || a.message.submittedAt.localeCompare(b.message.submittedAt) || a.message.id.localeCompare(b.message.id))
}

// The first message (from `from`, wrapping round) this admin has not toned yet, or -1.
export function firstUntoned(ordered: MessageView[], adminId: string, from = 0): number {
  for (let step = 0; step < ordered.length; step += 1) {
    const i = (from + step) % ordered.length
    if (!stageDone(ordered[i], adminId, 'tone')) return i
  }
  return -1
}

export function tally(votes: FeedbackVote[]): { approve: number; deny: number } {
  return { approve: votes.filter(v => v.approve).length, deny: votes.filter(v => v.deny).length }
}

// Statements and solutions this admin can vote on and has not voted on yet.
export function needsMyVoteCount(cases: StatementCase[], adminId: string): number {
  let n = 0
  for (const c of cases) {
    if (c.status !== 'open' || !c.can.vote) continue
    if (!c.votes.some(v => v.adminId === adminId)) n += 1
    n += c.solutions.filter(s => !s.votes.some(v => v.adminId === adminId)).length
  }
  return n
}

export const needsMyVote = (c: StatementCase, adminId: string) => needsMyVoteCount([c], adminId) > 0

export type CaseView = 'all' | 'needs' | 'open' | 'closed'
export type CaseSort = 'newest' | 'votes' | 'page'

export function filterCases(cases: StatementCase[], view: CaseView, page: string, adminId: string): StatementCase[] {
  return cases.filter(c => {
    if (page && c.channel.page !== page) return false
    if (view === 'needs') return needsMyVote(c, adminId)
    if (view === 'open') return c.status === 'open'
    if (view === 'closed') return c.status !== 'open'
    return true
  })
}

const newestMessage = (c: StatementCase) => c.messages.reduce((latest, m) => (m.submittedAt > latest ? m.submittedAt : latest), '')

export function sortCases(cases: StatementCase[], sort: CaseSort): StatementCase[] {
  const votes = (c: StatementCase) => c.votes.filter(v => v.approve || v.deny).length + c.solutions.reduce((n, s) => n + s.votes.length, 0)
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

// Who still has to finish validating a message before it joins its cases.
export function missingValidators(view: MessageView, admins: InboxBundle['admins']): string[] {
  const done = new Set(view.validations.filter(v => v.complete).map(v => v.adminId))
  return admins.filter(a => !done.has(a.id)).map(a => a.name)
}
