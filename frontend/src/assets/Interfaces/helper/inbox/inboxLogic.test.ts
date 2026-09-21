import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LABEL, TONE_CATEGORIES, channelAncestors, filterCases, firstUntoned, initials, messageDone, needsMyVoteCount, orderMessages,
  segmentText, sortCases, stableOrder, stageCounts, stageDone, stageLocked, tally,
} from './inboxLogic'
import { SEARCH, SPINES, doneValidation, message, statementCase, validation, vote } from './inboxTestData'

describe('tone categories', () => {
  it('has six labelled categories in a fixed order, most pleasant first', () => {
    expect(TONE_CATEGORIES).toEqual(['pleasant', 'mixedPleasant', 'neutral', 'mixed', 'mixedUnpleasant', 'unpleasant'])
    expect(TONE_CATEGORIES.map(c => CATEGORY_LABEL[c])).toEqual([
      'Pleasant', 'Mixed-leaning pleasant', 'Neutral', 'Mixed', 'Mixed-leaning unpleasant', 'Unpleasant'])
  })
})

describe('stage progress', () => {
  const toneOnly = message('a', { validations: [validation({ tone: 'neutral', toneSet: true })] })
  const subjectNoVerb = message('b', { validations: [validation({ tone: 'neutral', toneSet: true, channels: [SPINES] })] })
  const all = message('c', { validations: [doneValidation()] })
  const others = message('d', { validations: [doneValidation({ mine: false })] })

  it('counts a stage done only when this admin finished it', () => {
    const rows = [toneOnly, subjectNoVerb, all, others].map(v => [stageDone(v, 'tone'), stageDone(v, 'explicate')])
    expect(rows).toEqual([[true, false], [true, false], [true, true], [false, false]])
    expect([toneOnly, subjectNoVerb, all, others].map(messageDone)).toEqual([false, false, true, false])
    expect(stageCounts([toneOnly, subjectNoVerb, all, others])).toEqual({ tone: { count: 1, total: 4 }, explicate: { count: 3, total: 4 } })
  })

  it('keeps Explicate locked until the message has been toned', () => {
    expect(stageLocked(others, 'explicate')).toBe(true)
    expect(stageLocked(toneOnly, 'explicate')).toBe(false)
    expect(stageLocked(others, 'tone')).toBe(false)
  })
})

describe('the message queue', () => {
  const a = message('a', { category: 'neutral', date: '2026-08-10', count: 3 })
  const b = message('b', { category: 'unpleasant', date: '2026-08-12', count: 0 })
  const c = message('c', { category: 'unpleasant', date: '2026-08-11', count: 1 })
  const p = message('p', { category: 'pleasant', date: '2026-08-13', count: 2 })
  const none = message('n', { category: null, date: '2026-08-09' })

  it('orders by tone category (most pleasant first), oldest first within a category, no tone last', () => {
    expect(orderMessages([a, b, c, p, none]).map(v => v.message.id)).toEqual(['p', 'a', 'c', 'b', 'n'])
  })

  it('lets Configurers sort by how many validators have finished', () => {
    expect(orderMessages([a, b, c, p], 'fewest').map(v => v.message.id)).toEqual(['b', 'c', 'p', 'a'])
    expect(orderMessages([a, b, c, p], 'most').map(v => v.message.id)).toEqual(['a', 'p', 'c', 'b'])
  })

  it('keeps the places already taken and appends what is new', () => {
    const before = orderMessages([a, b, c])
    const known = before.map(v => v.message.id)
    const changed = { ...a, tone: { ...a.tone, category: 'unpleasant' as const } }   // its score moved
    expect(stableOrder(orderMessages([changed, b, c]), known).map(v => v.message.id)).toEqual(known)
    expect(stableOrder(orderMessages([a, b, c, p]), known).map(v => v.message.id)).toEqual([...known, 'p'])
    expect(stableOrder(orderMessages([a, c]), known).map(v => v.message.id)).toEqual(['a', 'c'])
  })

  it('finds the first message still to tone, wrapping round', () => {
    const toned = (id: string) => message(id, { validations: [validation({ tone: 'neutral', toneSet: true })] })
    const queue = [toned('x'), message('y'), toned('z')]
    expect(firstUntoned(queue, 0)).toBe(1)
    expect(firstUntoned(queue, 2)).toBe(1)
    expect(firstUntoned([toned('x')], 0)).toBe(-1)
  })
})

describe('cases', () => {
  const mine = vote({ mine: true, approve: true })
  const solution = (votes = [] as ReturnType<typeof vote>[]) => ({
    id: 's', title: 'T', description: '', target: SPINES, mine: false, createdAt: '2026-08-12', votes,
  })

  it('counts statements and solutions the admin can vote on and has not', () => {
    const open = statementCase('open', { solutions: [solution(), solution([mine])] })  // the statement + 1 solution
    const voted = statementCase('voted', { votes: [mine] })
    const noAccess = statementCase('na', { can: { vote: false, propose: false, close: false, reopen: false } })
    const closed = statementCase('closed', { status: 'approved' })
    const passedOnly = statementCase('passed', { votes: [vote({ mine: true, passed: true })] })
    expect(needsMyVoteCount([open, voted, noAccess, closed, passedOnly])).toBe(2)
  })

  it('filters by view and tone category, and sorts by newest feedback, votes or page', () => {
    const w1 = statementCase('w1', { votes: [mine] })
    const r1 = statementCase('r1', { channel: SEARCH, status: 'rejected', messages: [{ ...w1.messages[0], submittedAt: '2026-09-01' }] })
    const cases = [w1, r1]
    expect(filterCases(cases, 'all', '').map(c => c.id)).toEqual(['w1', 'r1'])
    expect(filterCases(cases, 'open', '').map(c => c.id)).toEqual(['w1'])
    expect(filterCases(cases, 'closed', '').map(c => c.id)).toEqual(['r1'])
    expect(filterCases([...cases, statementCase('w2')], 'needs', '').map(c => c.id)).toEqual(['w2'])
    expect(filterCases(cases, 'all', 'mixedUnpleasant').length).toBe(2)
    expect(filterCases(cases, 'all', 'pleasant')).toEqual([])
    expect(sortCases(cases, 'newest').map(c => c.id)).toEqual(['r1', 'w1'])
    expect(sortCases(cases, 'votes').map(c => c.id)).toEqual(['w1', 'r1'])
    expect(sortCases(cases, 'page').map(c => c.id)).toEqual(['r1', 'w1'])
  })

  it('tallies yes, no and pass, a vote on several sides counting in each', () => {
    const both = vote({ approve: true, deny: true })
    expect(tally([mine, both, vote({ deny: true }), vote({ passed: true }), vote({ passed: true, approve: true })])).toEqual({ approve: 3, deny: 2, passed: 2 })
  })
})

describe('text and names', () => {
  it('splits the text around flagged words', () => {
    const segs = segmentText('It freezes a lot', [{ categoryId: 'verb-fix', keyword: 'freezes', start: 3, end: 10 }])
    expect(segs.map(s => s.text)).toEqual(['It ', 'freezes', ' a lot'])
    expect(segs[1].flag?.categoryId).toBe('verb-fix')
    expect(segmentText('plain', [])).toEqual([{ text: 'plain' }])
  })

  it('skips a flag that overlaps an earlier one', () => {
    const segs = segmentText('abcdef', [
      { categoryId: 'a', keyword: 'abc', start: 0, end: 3 }, { categoryId: 'b', keyword: 'bcd', start: 1, end: 4 },
    ])
    expect(segs.map(s => s.text)).toEqual(['abc', 'def'])
  })

  it('shows the levels above the most specific one as small text, and initials for the sign-in chip', () => {
    expect(channelAncestors(SPINES)).toEqual(['Writer', 'Shelf', 'Sidebar Shelf'])
    expect(initials('Dana Ruiz')).toBe('DR')
    expect(initials('Sam')).toBe('S')
  })
})
