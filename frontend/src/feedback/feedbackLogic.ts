import type { FeedbackStatus, KeywordFlag, Role, StaffBundle, StaffMessage, Statement, Tone, ToneCategory } from './feedbackTypes'

// Pure helpers behind the feedback screens (tested in Node).

export const TONES: Tone[] = ['pleasant', 'unpleasant', 'mixed', 'neutral']
export const TONE_NAME: Record<Tone, string> = { pleasant: 'Pleasant', unpleasant: 'Unpleasant', mixed: 'Mixed', neutral: 'Neutral' }

// The fixed order tone categories are listed in, most pleasant first.
export const TONE_CATEGORIES: ToneCategory[] = ['pleasant', 'mixedPleasant', 'neutral', 'mixed', 'mixedUnpleasant', 'unpleasant']
export const CATEGORY_LABEL: Record<ToneCategory, string> = {
  pleasant: 'Pleasant', mixedPleasant: 'Mixed-leaning pleasant', neutral: 'Neutral', mixed: 'Mixed',
  mixedUnpleasant: 'Mixed-leaning unpleasant', unpleasant: 'Unpleasant',
}

export const ROLES: Role[] = ['checker', 'voter', 'channelManager', 'planner']
export const ROLE_NAME: Record<Role, string> = { checker: 'Checker', voter: 'Voter', channelManager: 'Channel manager', planner: 'Planner' }

// What a writer is told about where their feedback stands.
export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  received: 'Received', voting: 'In voting', planned: 'Planned', inProgress: 'In progress', done: 'Done', declined: 'Declined',
}
export const STEP_LABEL: Record<string, string> = {
  received: 'Received', checked: 'Checked', voting: 'In voting', planned: 'Planned', inProgress: 'In progress', done: 'Done', declined: 'Declined',
}

// The console a node is in (its id's first two parts), or the interface itself: where roles are held.
export const scopeOf = (channelId: string) => channelId.split('/').slice(0, 2).join('/')

// Splits a message into plain and keyword-flagged pieces (earlier, longer flags win over overlapping ones).
export interface TextSegment { text: string; flag?: KeywordFlag }
export function segmentText(text: string, flags: KeywordFlag[]): TextSegment[] {
  const out: TextSegment[] = []
  let at = 0
  for (const flag of [...flags].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (flag.start < at) continue
    if (flag.start > at) out.push({ text: text.slice(at, flag.start) })
    out.push({ text: text.slice(flag.start, flag.end), flag })
    at = flag.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

// "DR" for Dana Ruiz: the Acting as chip.
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

// "Jun 3" for an ISO date or time (the date as given when it does not parse).
export function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The messages a helper still has to check, oldest first.
export const toCheck = (bundle: StaffBundle): StaffMessage[] =>
  bundle.messages.filter(m => !m.checked).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

export const messagesOf = (bundle: StaffBundle, statement: Statement): StaffMessage[] =>
  statement.messageIds.map(id => bundle.messages.find(m => m.id === id)).filter((m): m is StaffMessage => !!m)

// Statements in voting (not yet decided) under a channel node (null: all), most messages first, then oldest.
export function inVoting(bundle: StaffBundle, under: string | null): Statement[] {
  const first = (s: Statement) => messagesOf(bundle, s).map(m => m.submittedAt).sort()[0] ?? ''
  return bundle.statements
    .filter(s => s.decision === null && (!under || s.channelId === under || s.channelId.startsWith(`${under}/`)))
    .sort((a, b) => b.messageIds.length - a.messageIds.length || first(a).localeCompare(first(b)))
}

// How many statements the admin acting can still vote on.
export const votesWaiting = (bundle: StaffBundle): number =>
  bundle.statements.filter(s => s.can.vote && !s.votes.some(v => v.mine)).length

// The roles an admin holds on a scope, in the fixed order.
export const rolesOn = (roles: Record<string, Role[]>, scope: string): Role[] => ROLES.filter(r => (roles[scope] ?? []).includes(r))
