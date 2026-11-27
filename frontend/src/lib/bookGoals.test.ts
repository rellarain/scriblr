import { describe, expect, it } from 'vitest'
import { emptyDay, type DayTotals } from './facets'
import { addDays } from './projection'
import {
  axisAt, bookEstimate, durationPhrase, needsPhrase, paceAmount, paceLine, partOfMonth, planParts, primaryUnit, rangePhrase, shareGoal,
  shortRange, spanFor, timelineAxis, usualPace, weeklyTotals,
} from './bookGoals'

const TODAY = '2026-11-27'
// A week of `words` net words (spread over its seven days) and `chapters` chapters made, `weeksAgo` weeks before today.
function activity(weeks: Array<{ words: number; chapters?: number }>): Record<string, DayTotals> {
  const daily: Record<string, DayTotals> = {}
  weeks.forEach((w, i) => {
    for (let d = 0; d < 7; d += 1) {
      const day = addDays(TODAY, -(i * 7 + d))
      daily[day] = { ...emptyDay(), draft: d === 0 ? w.words : 0, kinds: d === 0 && w.chapters ? { chapter: w.chapters } : {} }
    }
  })
  return daily
}

describe('the usual pace', () => {
  it('adds up each of the last eight weeks, never below nothing', () => {
    const daily = activity([{ words: 1500 }, { words: -200 }, { words: 900, chapters: 2 }])
    expect(weeklyTotals(daily, 'words', TODAY)).toEqual([1500, 0, 900, 0, 0, 0, 0, 0])
    expect(weeklyTotals(daily, 'chapter', TODAY)).toEqual([0, 0, 2, 0, 0, 0, 0, 0])
  })

  it('is the slower and the faster of the usual weeks', () => {
    const pace = usualPace([1400, 1500, 1600, 1700, 1800, 1900, 2000, 1450])
    expect(pace?.slower).toBeCloseTo(1487.5)
    expect(pace?.faster).toBeCloseTo(1825)
  })

  it('needs two weeks with any work, and is never nothing for a writer who skips weeks', () => {
    expect(usualPace([1500, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
    const pace = usualPace([0, 0, 0, 0, 0, 0, 500, 800])
    expect(pace?.slower).toBeGreaterThan(0)
    expect(pace?.faster).toBeGreaterThanOrEqual(pace?.slower ?? 0)
  })

  it('is said rounded: words to tens or fifties, nodes to halves', () => {
    expect(paceAmount({ slower: 1437, faster: 1912 }, 'words')).toBe('1,450 to 1,900 words')
    expect(paceAmount({ slower: 412, faster: 418 }, 'words')).toBe('410 to 420 words')
    expect(paceAmount({ slower: 1.8, faster: 2.1 }, 'chapter')).toBe('about 2 chapters')
    expect(paceAmount({ slower: 0.4, faster: 1.6 }, 'scene')).toBe('0.5 to 1.5 scenes')
  })
})

describe('how long the rest would take', () => {
  it('runs from the faster pace to the slower', () => {
    const span = spanFor(4000, { slower: 1000, faster: 2000 }, TODAY)
    expect(span).toEqual({ weeksMin: 2, weeksMax: 4, early: '2026-12-11', late: '2026-12-25' })
  })

  it('says it in weeks, months or years', () => {
    expect(durationPhrase(0.4, 1.2)).toBe('About a week')
    expect(durationPhrase(3, 5)).toBe('About 3 to 5 weeks')
    expect(durationPhrase(26, 34)).toBe('About 6 to 8 months')
    expect(durationPhrase(26, 26.5)).toBe('About 6 months')
    expect(durationPhrase(110, 160)).toBe('About 2 to 3 years')
  })

  it('says when, by the part of the month', () => {
    expect(partOfMonth('2027-05-24')).toBe('late May')
    expect(partOfMonth('2027-07-15')).toBe('mid-July')
    expect(partOfMonth('2027-06-03', true)).toBe('early Jun')
    expect(rangePhrase('2027-05-24', '2027-07-15')).toBe('between late May and mid-July 2027')
    expect(rangePhrase('2026-12-28', '2027-02-14')).toBe('between late December 2026 and mid-February 2027')
    expect(rangePhrase('2027-07-12', '2027-07-18')).toBe('around mid-July 2027')
    expect(shortRange('2027-02-25', '2027-03-14')).toBe('late Feb to mid-Mar')
  })
})

describe("a book's estimate", () => {
  const daily = activity([{ words: 1500, chapters: 1 }, { words: 1700 }, { words: 1600, chapters: 1 }, { words: 1800 }, { words: 1500 }, { words: 1900 }, { words: 1400 }, { words: 1650 }])
  const counts = { words: 41200, chapter: 14, scene: 38, moment: 112 }

  it('reads each goal set against its own pace, and the book is done when the last one is', () => {
    const e = bookEstimate({ words: 90000, chapter: 36, scene: null, moment: null }, counts, daily, TODAY)
    expect(e.lines.map(l => [l.unit, l.done, l.target, l.left])).toEqual([['words', 41200, 90000, 48800], ['chapter', 14, 36, 22]])
    expect(e.met).toBe(false)
    expect(e.noPace).toEqual([])
    const words = e.lines[0].span
    const chapters = e.lines[1].span
    expect(e.span?.late).toBe([words?.late, chapters?.late].sort().pop())
    expect(e.span?.weeksMax).toBe(Math.max(words?.weeksMax ?? 0, chapters?.weeksMax ?? 0))
  })

  it('names the goals left that have no pace yet, and has no span then', () => {
    const e = bookEstimate({ words: 90000, chapter: null, scene: 120, moment: null }, counts, daily, TODAY)
    expect(e.noPace).toEqual(['scene'])
    expect(e.span).toBeNull()
  })

  it('is met when every goal set is reached, and has nothing to say with no goals', () => {
    expect(bookEstimate({ words: 40000, chapter: 10, scene: null, moment: null }, counts, daily, TODAY).met).toBe(true)
    const none = bookEstimate({ words: null, chapter: null, scene: null, moment: null }, counts, daily, TODAY)
    expect(none.lines).toEqual([])
    expect(none.met).toBe(false)
  })

  it('says the paces in one line', () => {
    const e = bookEstimate({ words: 90000, chapter: 36, scene: null, moment: null }, counts, daily, TODAY)
    expect(paceLine(e.lines)).toMatch(/^1,\d{3} to 1,\d{3} words and .+ chapters? a week$/)
  })

  it('plans in words when there is a word goal, else the first outline goal', () => {
    expect(primaryUnit({ words: 9, chapter: 3, scene: null, moment: null })).toBe('words')
    expect(primaryUnit({ words: null, chapter: null, scene: 4, moment: 9 })).toBe('scene')
    expect(primaryUnit({ words: null, chapter: null, scene: null, moment: null })).toBeNull()
  })
})

describe("the book's parts", () => {
  const pace = { slower: 1000, faster: 2000 }

  it('share a goal by their share of the chapters', () => {
    const parts = [
      { id: 'a1', label: 'Arc 1', done: 12000, chapters: 6, due: null },
      { id: 'a2', label: 'Arc 2', done: 3000, chapters: 12, due: null },
      { id: 'a3', label: 'Arc 3', done: 0, chapters: 18, due: null },
    ]
    expect(shareGoal(parts, 72000).map(p => p.target)).toEqual([12000, 24000, 36000])
    expect(shareGoal(parts.map(p => ({ ...p, chapters: 0 })), 72000)).toEqual([])
  })

  it('come one after another at the pace, a part with nothing left done', () => {
    const plans = planParts([
      { id: 'a1', label: 'Arc 1', target: 10000, done: 10000, due: null },
      { id: 'a2', label: 'Arc 2', target: 10000, done: 6000, due: null },
      { id: 'a3', label: 'Arc 3', target: 4000, done: 0, due: null },
    ], pace, TODAY)
    expect(plans.map(p => p.status)).toEqual(['done', null, null])
    expect(plans[0]).toMatchObject({ left: 0, start: null, early: null })
    expect(plans[1]).toMatchObject({ left: 4000, start: TODAY, early: '2026-12-11', late: '2026-12-25' })
    expect(plans[2]).toMatchObject({ left: 4000, start: '2026-12-11', early: '2026-12-25', late: '2027-01-22' })
  })

  it('with dates, say the pace each needs after the date before it, and whether it is within reach', () => {
    const plans = planParts([
      { id: 'a1', label: 'Arc 2 · The Toll', target: 20000, done: 0, due: '2027-01-22' },
      { id: 'a2', label: 'Arc 3 · Far Bank', target: 8000, done: 0, due: '2027-03-05' },
    ], pace, TODAY)
    expect(plans[0]).toMatchObject({ needs: 2500, after: null, status: 'above' })
    expect(plans[1]).toMatchObject({ needs: 1333.3333333333333, after: 'Arc 2 · The Toll', status: 'reach' })
    expect(needsPhrase(plans[1].needs as number, 'words')).toBe('needs 1,335 words a week')
    expect(needsPhrase(1.2, 'chapter')).toBe('needs 1.5 chapters a week')
  })

  it('say a date gone by with work left, and a part done', () => {
    const plans = planParts([
      { id: 'a1', label: 'Arc 1', target: 100, done: 100, due: '2026-10-01' },
      { id: 'a2', label: 'Arc 2', target: 100, done: 0, due: '2026-11-01' },
    ], null, TODAY)
    expect(plans.map(p => p.status)).toEqual(['done', 'past'])
  })

  it('without a pace, have no place on the timeline and no reach', () => {
    const [p] = planParts([{ id: 'b', label: 'The book', target: 900, done: 0, due: '2027-01-01' }], null, TODAY)
    expect(p).toMatchObject({ start: null, early: null, late: null, status: null })
    expect(p.needs).toBeGreaterThan(0)
  })
})

describe('the timeline', () => {
  it('runs from the start of this month to the end of the last month, with a label for each', () => {
    const axis = timelineAxis(TODAY, ['2027-03-14', null, '2027-01-02'])
    expect(axis.start).toBe('2026-11-01')
    expect(axis.end).toBe('2027-03-31')
    expect(axis.months.map(m => m.label)).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar'])
    expect(axis.months.map(m => m.year)).toEqual(['2026', null, '2027', null, null])
    expect(axis.months[0].at).toBe(0)
  })

  it('is at least two months long, and labels every few months when it is long', () => {
    expect(timelineAxis(TODAY, []).end).toBe('2026-12-31')
    const long = timelineAxis(TODAY, ['2029-06-01'])
    expect(long.months.length).toBeLessThanOrEqual(12)
  })

  it('never runs more than five years out', () => {
    expect(timelineAxis(TODAY, ['2090-01-01']).end < '2032-01-01').toBe(true)
  })

  it('places a day as a share of its width, held inside it', () => {
    const axis = timelineAxis(TODAY, ['2027-03-14'])
    expect(axisAt(axis, axis.start)).toBe(0)
    expect(axisAt(axis, '2020-01-01')).toBe(0)
    expect(axisAt(axis, '2099-01-01')).toBe(100)
    expect(axisAt(axis, TODAY)).toBeGreaterThan(15)
  })
})
