import { describe, expect, it } from 'vitest'
import type { StaffBundle, StaffMessage, Statement } from './feedbackTypes'
import { inVoting, initials, rolesOn, scopeOf, segmentText, shortDate, toCheck, votesWaiting } from './feedbackLogic'

const msg = (id: string, over: Partial<StaffMessage> = {}): StaffMessage => ({
  id, text: 'x', submittedAt: '2026-08-10', senderTone: null, channelId: 'writer/draft/draft', verbId: 'v', fromChannel: null,
  tone: null, checked: false, checkedAt: null, checkedByMe: false, statementId: null, questions: [], comments: [], flags: [],
  status: 'received', history: [], ...over,
})
const st = (id: string, channelId: string, messageIds: string[], over: Partial<Statement> = {}): Statement => ({
  id, key: `${channelId}::v`, channelId, verbId: 'v', verbName: 'Fix', messageIds, tone: { category: null, pleasant: 0, unpleasant: 0, neutral: 0, n: 0 },
  votes: [], tally: { approve: 0, deny: 0, pass: 0 }, decision: null, decisionNote: '', decidedAt: null, work: null, history: [],
  can: { vote: true, correct: false, decide: false }, ...over,
})
const bundle = (messages: StaffMessage[], statements: Statement[]): StaffBundle => ({
  me: 'a', admins: [], verbCategories: [], messages, statements, roleHistory: [], can: { check: true, manageVerbs: false },
})

describe('feedback logic', () => {
  it('names the scope a node is in', () => {
    expect(scopeOf('writer/draft/draft/autosave')).toBe('writer/draft')
    expect(scopeOf('writer')).toBe('writer')
  })

  it('marks keywords, the earlier and longer first', () => {
    const flags = [{ categoryId: 'b', keyword: 'great', start: 4, end: 9 }, { categoryId: 'a', keyword: 'it', start: 0, end: 2 }, { categoryId: 'c', keyword: 'ea', start: 6, end: 8 }]
    expect(segmentText('it  great!', flags).map(s => [s.text, s.flag?.categoryId ?? ''])).toEqual([['it', 'a'], ['  ', ''], ['great', 'b'], ['!', '']])
  })

  it('lists what is left to check oldest first, and statements in voting under a node', () => {
    const b = bundle(
      [msg('m2', { submittedAt: '2026-08-12' }), msg('m1'), msg('m3', { checked: true }), msg('m4', { checked: true, submittedAt: '2026-08-01' })],
      [st('s1', 'writer/draft/draft', ['m3']), st('s2', 'reader/nook', ['m3', 'm4']), st('s3', 'writer/draft', ['m4'], { decision: 'accepted' })],
    )
    expect(toCheck(b).map(m => m.id)).toEqual(['m1', 'm2'])
    expect(inVoting(b, null).map(s => s.id)).toEqual(['s2', 's1'])
    expect(inVoting(b, 'writer').map(s => s.id)).toEqual(['s1'])
    expect(votesWaiting(b)).toBe(3)
  })

  it('shortens names and dates and orders roles', () => {
    expect(initials('Dana  Ruiz')).toBe('DR')
    expect(shortDate('nope')).toBe('nope')
    expect(shortDate(null)).toBe('')
    expect(rolesOn({ x: ['planner', 'checker'] }, 'x')).toEqual(['checker', 'planner'])
    expect(rolesOn({}, 'x')).toEqual([])
  })
})
