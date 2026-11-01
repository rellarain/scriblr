import { describe, expect, it } from 'vitest'
import { dayOf, estimateOf, formatEstimate, parseQuickAdd, type QuickTarget } from './quickAdd'

// 2026-11-04 is a Wednesday.
const TODAY = '2026-11-04'
const TARGETS: QuickTarget[] = [
  { id: 'c3', title: 'Chapter 3', tree: 'outline', kind: 'chapter' },
  { id: 'c31', title: 'Chapter 31', tree: 'outline', kind: 'chapter' },
  { id: 'p1', title: 'The Smuggler', tree: 'plot', kind: 'plotline' },
]

describe('estimateOf', () => {
  it('reads hours, minutes, both, and a bare number as minutes', () => {
    expect([estimateOf('2h'), estimateOf('45m'), estimateOf('1h30m'), estimateOf('90'), estimateOf('1.5h')]).toEqual([120, 45, 90, 90, 90])
  })
  it('refuses nothing, zero and more than a day', () => {
    expect([estimateOf(''), estimateOf('0'), estimateOf('25h'), estimateOf('soon')]).toEqual([null, null, null, null])
  })
})

describe('dayOf', () => {
  it('names today, tomorrow, a date and the next weekday after today', () => {
    expect(dayOf('today', TODAY)).toBe(TODAY)
    expect(dayOf('Tomorrow', TODAY)).toBe('2026-11-05')
    expect(dayOf('2027-01-31', TODAY)).toBe('2027-01-31')
    expect(dayOf('fri', TODAY)).toBe('2026-11-06')
    expect(dayOf('wednesday', TODAY)).toBe('2026-11-11') // not today: the next one
    expect(dayOf('mon', TODAY)).toBe('2026-11-09')
  })
  it('knows no other word', () => {
    expect([dayOf('soon', TODAY), dayOf('frid', TODAY), dayOf('2027-13-45', TODAY)]).toEqual([null, null, null])
  })
})

describe('parseQuickAdd', () => {
  it('takes the priority, estimate, due day and node out of the line, leaving the label', () => {
    expect(parseQuickAdd('Revise ch 3 !high ~2h fri @chapter 3', TODAY, TARGETS)).toEqual({
      label: 'Revise ch 3', priority: 'high', estimateMinutes: 120, dueDate: '2026-11-06', target: TARGETS[0],
    })
  })

  it('works with the parts in any order, and takes the short priority words', () => {
    const p = parseQuickAdd('!l ^tomorrow ~30 Water the plants', TODAY)
    expect([p.label, p.priority, p.estimateMinutes, p.dueDate]).toEqual(['Water the plants', 'low', 30, '2026-11-05'])
  })

  it('leaves a plain line alone', () => {
    expect(parseQuickAdd('  Call the printer  ', TODAY)).toEqual({ label: 'Call the printer', priority: null, estimateMinutes: null, dueDate: null, target: null })
  })

  it('takes a day word only as the last word, so a label can say Friday', () => {
    expect(parseQuickAdd('Email on Friday notes', TODAY).dueDate).toBeNull()
    expect(parseQuickAdd('Email the notes fri', TODAY).dueDate).toBe('2026-11-06')
    expect(parseQuickAdd('fri', TODAY).label).toBe('fri')
  })

  it('keeps what is not a part: an unknown priority word, a node that does not exist, a bad estimate', () => {
    const p = parseQuickAdd('Plan !urgent ~soon @nowhere', TODAY, TARGETS)
    expect(p.label).toBe('Plan !urgent ~soon @nowhere')
    expect([p.priority, p.estimateMinutes, p.target]).toEqual([null, null, null])
  })

  it('matches a node by its name, preferring the exact one, and hands back the words after it', () => {
    expect(parseQuickAdd('Fix @Chapter 3 !m', TODAY, TARGETS).target?.id).toBe('c3')
    expect(parseQuickAdd('Fix @chapter 31', TODAY, TARGETS).target?.id).toBe('c31')
    const p = parseQuickAdd('Check @smuggler plot', TODAY, TARGETS)
    expect(p.target?.id).toBe('p1')
    expect(p.label).toBe('Check plot')
  })
})

describe('formatEstimate', () => {
  it('reads minutes as minutes, hours and both', () => {
    expect([formatEstimate(45), formatEstimate(120), formatEstimate(90)]).toEqual(['45m', '2h', '1h 30m'])
  })
})
