import { describe, expect, it } from 'vitest'
import {
  BAND_LABEL, TONE_BANDS, filterCases, firstUntoned, needsMyVoteCount, orderMessages, segmentText, sortCases, stageCounts, stageDone,
  tally, toneScoreLabel,
} from './inboxLogic'
import { SEARCH, SPINES, message, statementCase, tone, validation } from './inboxTestData'

const me = 'adm-dana'
const done = validation(me, { tone: 'pleasant', channels: [SPINES], statements: [{ channel: SPINES, verbId: 'verb-fix' }], complete: true })

describe('tone bands', () => {
  it('has five labelled bands, most pleasant first', () => {
    expect(TONE_BANDS).toEqual(['mostlyPleasant', 'slightlyPleasant', 'neutral', 'slightlyUnpleasant', 'mostlyUnpleasant'])
    expect(TONE_BANDS.map(b => BAND_LABEL[b])).toEqual(['Mostly pleasant', 'Slightly pleasant', 'Neutral', 'Slightly unpleasant', 'Mostly unpleasant'])
  })

  it('shows the score over every response as net over count', () => {
    expect(toneScoreLabel(tone('slightlyPleasant', 1, 3))).toBe('1/3')
    expect(toneScoreLabel(tone('mostlyUnpleasant', -2, 4))).toBe('-2/4')
    expect(toneScoreLabel(tone('neutral', 0, 0))).toBe('no responses')
  })
})

describe('stage progress', () => {
  it('counts a stage done only when this admin finished it', () => {
    const toneOnly = message('a', { validations: [validation(me, { tone: 'neutral' })] })
    const channelNoVerb = message('b', { validations: [validation(me, { tone: 'neutral', channels: [SPINES] })] })
    const all = message('c', { validations: [done] })
    const others = message('d', { validations: [{ ...done, adminId: 'adm-lee' }] })
    expect([toneOnly, channelNoVerb, all, others].map(v => [stageDone(v, me, 'tone'), stageDone(v, me, 'channel'), stageDone(v, me, 'explicate')])).toEqual([
      [true, false, false], [true, true, false], [true, true, true], [false, false, false],
    ])
    expect(stageCounts([toneOnly, channelNoVerb, all, others], me)).toEqual({
      tone: { count: 1, total: 4 }, channel: { count: 2, total: 4 }, explicate: { count: 3, total: 4 },
    })
  })
})

describe('the message queue', () => {
  const a = message('a', { band: 'neutral', date: '2026-08-10' })
  const b = message('b', { band: 'mostlyUnpleasant', date: '2026-08-12' })
  const c = message('c', { band: 'mostlyUnpleasant', date: '2026-08-11' })

  it('follows the admin-defined tone priority, oldest first within a band', () => {
    expect(orderMessages([a, b, c], TONE_BANDS).map(v => v.message.id)).toEqual(['a', 'c', 'b'])
    const reversed = [...TONE_BANDS].reverse()
    expect(orderMessages([a, b, c], reversed).map(v => v.message.id)).toEqual(['c', 'b', 'a'])
  })

  it('finds the first message still to tone, wrapping round', () => {
    const toned = (id: string) => message(id, { validations: [validation(me, { tone: 'neutral' })] })
    const queue = [toned('x'), message('y'), toned('z')]
    expect(firstUntoned(queue, me, 0)).toBe(1)
    expect(firstUntoned(queue, me, 2)).toBe(1) // wraps past the end
    expect(firstUntoned([toned('x')], me, 0)).toBe(-1)
  })
})

describe('cases', () => {
  const mine = { adminId: me, approve: true, deny: false, approveNote: '', denyNote: '', updatedAt: '' }
  const solution = (votes = [] as typeof mine[]) => ({
    id: 's', title: 'T', description: '', target: SPINES, proposedBy: 'x', createdAt: '2026-08-12', votes,
  })

  it('counts statements and solutions the admin can vote on and has not', () => {
    const open = statementCase('open', { solutions: [solution(), solution([mine])] })  // statement + 1 solution
    const voted = statementCase('voted', { votes: [mine] })                             // nothing left
    const noAccess = statementCase('na', { can: { vote: false, propose: false, close: false, reopen: false } })
    const closed = statementCase('closed', { status: 'approved' })
    expect(needsMyVoteCount([open, voted, noAccess, closed], me)).toBe(2)
    expect(needsMyVoteCount([open], 'adm-lee')).toBe(3)
  })

  it('filters by view and page, and sorts by newest feedback, votes or page', () => {
    const w1 = statementCase('w1', { votes: [mine] })
    const r1 = statementCase('r1', { channel: SEARCH, status: 'rejected', messages: [{ ...w1.messages[0], submittedAt: '2026-09-01' }] })
    const cases = [w1, r1]
    expect(filterCases(cases, 'all', '', me).map(c => c.id)).toEqual(['w1', 'r1'])
    expect(filterCases(cases, 'open', '', me).map(c => c.id)).toEqual(['w1'])
    expect(filterCases(cases, 'closed', '', me).map(c => c.id)).toEqual(['r1'])
    expect(filterCases([...cases, statementCase('w2')], 'needs', '', me).map(c => c.id)).toEqual(['w2']) // a closed case needs no vote
    expect(filterCases(cases, 'all', 'Reader', me).map(c => c.id)).toEqual(['r1'])
    expect(sortCases(cases, 'newest').map(c => c.id)).toEqual(['r1', 'w1'])
    expect(sortCases(cases, 'votes').map(c => c.id)).toEqual(['w1', 'r1'])
    expect(sortCases(cases, 'page').map(c => c.id)).toEqual(['r1', 'w1']) // Reader before Writer
  })

  it('tallies for and against, counting a vote on both sides in each', () => {
    const both = { ...mine, adminId: 'b', deny: true }
    expect(tally([mine, both, { ...mine, adminId: 'c', approve: false, deny: true }])).toEqual({ approve: 2, deny: 2 })
  })
})

describe('keyword highlights', () => {
  it('splits the text around flagged words', () => {
    const text = 'It freezes a lot'
    const segs = segmentText(text, [{ categoryId: 'verb-fix', keyword: 'freezes', start: 3, end: 10 }])
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
})
