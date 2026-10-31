import { describe, expect, it } from 'vitest'
import { barYears, buildFacetGrid, monthBars, rowLetters, GRID_WEEKS } from './scheduleCalendar'
import { emptyDay, type DayTotals, type MonthTotals, type Recurrence, type Routine, type Shift, type RibbonData, type Goal, FACETS } from './facets'
import { goalProgress, goalSeries, paceOf, weekOf } from './projection'
import { addUnits, patternDays, routineWindow, shiftOccurrences } from './recurrence'
import { activityLevel, ribbonSlots } from './ribbon'

const day = (o: Partial<DayTotals>): DayTotals => ({ ...emptyDay(), ...o })
const month = (o: Partial<MonthTotals>): MonthTotals => ({ ...emptyDay(), activeDays: 1, ...o })
const rec = (o: Partial<Recurrence>): Recurrence => ({ kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: '2026-10-01', until: null, ...o })
const base = { daily: {}, monthly: {}, facets: FACETS, rule: 'busiest' as const, dailyGoals: {}, weekStart: 'monday' as const }

describe('the facet grid', () => {
  it('has 52 weeks of 7 days, Monday first, ending in the week of today (Sat Oct 31 2026), with later days hidden', () => {
    const g = buildFacetGrid({ ...base, today: '2026-10-31' })
    expect(g.weeks).toBe(GRID_WEEKS)
    expect(g.cells).toHaveLength(364)
    expect(g.cells[0].date).toBe('2025-11-03') // a Monday
    expect(g.cells[364 - 7].date).toBe('2026-10-26')
    expect(g.cells[363].level).toBe(-1) // Sunday Nov 1 is not here yet
    expect(g.cells[362]).toMatchObject({ date: '2026-10-31', today: true })
    expect(g.cells.filter(c => c.today)).toHaveLength(1)
    expect(rowLetters('monday')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })
  it('starts the week on Sunday when asked', () => {
    const g = buildFacetGrid({ ...base, weekStart: 'sunday', today: '2026-10-31' })
    expect(g.cells[0].date).toBe('2025-11-02') // a Sunday
    expect(rowLetters('sunday')[0]).toBe('S')
    expect(g.cells.at(-1)?.date).toBe('2026-10-31') // a Saturday ends that week, so nothing is hidden
    expect(g.cells.some(c => c.level === -1)).toBe(false)
  })
  it('puts each month in a rectangle over the weeks that begin in it', () => {
    const g = buildFacetGrid({ ...base, today: '2026-10-31' })
    expect(g.months[0]).toMatchObject({ name: 'November', col: 1, span: 4 }) // Mondays Nov 3, 10, 17, 24
    expect(g.months.reduce((n, m) => n + m.span, 0)).toBe(GRID_WEEKS)
    expect(g.months.at(-1)).toMatchObject({ name: 'October', span: 4 }) // Oct 5, 12, 19, 26
    expect(g.months.every((m, i) => i === 0 || m.col === g.months[i - 1].col + g.months[i - 1].span)).toBe(true)
  })
  it('shades by the busiest day, or by share of the daily goal when there is one', () => {
    const daily = { '2026-10-29': day({ draft: 100 }), '2026-10-30': day({ draft: 400 }), '2026-10-31': day({ draft: 700 }) }
    const busiest = buildFacetGrid({ ...base, daily, facets: ['draft'], today: '2026-10-31' })
    expect(busiest.cells.slice(360, 363).map(c => c.level)).toEqual([1, 3, 4])
    const goal = buildFacetGrid({ ...base, daily, facets: ['draft'], rule: 'goal', dailyGoals: { draft: 500 }, today: '2026-10-31' })
    expect(goal.cells.slice(360, 363).map(c => c.level)).toEqual([1, 3, 4]) // 20%, 80%, 140% of 500
    const noGoal = buildFacetGrid({ ...base, daily, facets: ['draft'], rule: 'goal', today: '2026-10-31' })
    expect(noGoal.cells.slice(360, 363).map(c => c.level)).toEqual([1, 3, 4]) // no goal: the busiest day
  })
  it('takes the highest level of the selected facets, and lists each in the tooltip', () => {
    const daily = { '2026-10-31': day({ draft: 500, plot: 1 }), '2026-10-30': day({ plot: 4 }) }
    const both = buildFacetGrid({ ...base, daily, today: '2026-10-31' })
    expect(both.cells[362].level).toBe(4)
    expect(both.cells[362].title).toBe('Sat, Oct 31 · Plot 1 plot node · Draft 500 words')
    const onlyPlot = buildFacetGrid({ ...base, daily, facets: ['plot'], today: '2026-10-31' })
    expect(onlyPlot.cells[362].level).toBe(1) // 1 of the busiest 4
    expect(onlyPlot.cells[361].level).toBe(4)
    expect(onlyPlot.cells[360].title).toBe('No activity on Thu, Oct 29')
    expect(onlyPlot.total.plot).toBe(5)
  })
  it('colours a day by the facet with the most activity: the highest level, then the larger share of its measure', () => {
    const daily = {
      '2026-10-29': day({ draft: 600, outline: 1 }), // draft is at its goal (level 4), outline only a quarter of its goal
      '2026-10-30': day({ draft: 300, plot: 3 }), // both at level 3: plot 3 of 4 (0.75) beats draft 300 of 500 (0.6)
      '2026-10-31': day({ outline: 2 }),
    }
    const g = buildFacetGrid({ ...base, daily, rule: 'goal', dailyGoals: { draft: 500, outline: 4, plot: 4 }, today: '2026-10-31' })
    expect(g.cells[360].facet).toBe('draft')
    expect(g.cells[361].facet).toBe('plot')
    expect(g.cells[362].facet).toBe('outline')
    expect(g.cells[359].facet).toBeNull() // a day with nothing
  })
  it('marks the days a daily goal was met', () => {
    const daily = { '2026-10-30': day({ draft: 499 }), '2026-10-31': day({ draft: 500 }) }
    const g = buildFacetGrid({ ...base, daily, facets: ['draft'], rule: 'goal', dailyGoals: { draft: 500 }, today: '2026-10-31' })
    expect([g.cells[361].met, g.cells[362].met]).toEqual([false, true])
    expect(g.cells[362].title).toContain('goal met')
    expect(buildFacetGrid({ ...base, daily, facets: ['draft'], today: '2026-10-31' }).cells[362].met).toBe(false)
  })
  it('does not count a day that cut words as activity', () => {
    const g = buildFacetGrid({ ...base, daily: { '2026-10-31': day({ draft: -300 }) }, facets: ['draft'], today: '2026-10-31' })
    expect(g.cells[362].level).toBe(0)
    expect(g.activeDays).toBe(0)
  })
})

describe('the monthly bars', () => {
  const monthly = {
    '2025-08': month({ draft: 3100, outline: 62 }),
    '2025-09': month({ draft: 1500, outline: 30 }),
    '2025-10': month({ draft: 0, outline: 0 }),
  }
  it('are the months before the grid, oldest first, as the average a day', () => {
    const bars = monthBars(monthly, '2025-11', FACETS)
    expect(bars.map(b => b.key)).toEqual(['2025-08', '2025-09', '2025-10'])
    expect(bars[0].segments.find(s => s.facet === 'draft')?.perDay).toBeCloseTo(100) // 3100 words over 31 days
    expect(bars[1].segments.find(s => s.facet === 'outline')?.perDay).toBeCloseTo(1) // 30 nodes over 30 days
    expect(bars[0].title).toBe('August 2025 · Outline 2 nodes a day · Draft 100 words a day')
  })
  it('are as tall as the month is busy, and a quiet month is empty', () => {
    const bars = monthBars(monthly, '2025-11', ['draft'])
    expect(bars[0].height).toBe(1)
    expect(bars[1].height).toBeCloseTo((1500 / 30) / (3100 / 31))
    expect(bars[2].height).toBe(0)
    expect(bars[2].segments).toEqual([])
    const stacked = monthBars(monthly, '2025-11', ['draft', 'outline'])[0]
    expect(stacked.segments.reduce((n, s) => n + s.part, 0)).toBeCloseTo(1)
  })
  it('stop where the grid starts', () => {
    expect(monthBars(monthly, '2025-09', FACETS).map(b => b.key)).toEqual(['2025-08'])
    const g = buildFacetGrid({ ...base, monthly, today: '2026-10-31' })
    expect(g.bars.map(b => b.key)).toEqual(['2025-08', '2025-09', '2025-10'])
  })
})

describe('goal progress', () => {
  const goal: Goal = { id: 'g', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: 500, weekly: 3000, total: 90000, deadline: '2027-03-01' }
  const steady = (perDay: number) => Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`2026-10-${String(31 - i > 0 ? 31 - i : 1).padStart(2, '0')}`, day({ draft: perDay })]))
  it('works out the pace of the last 28 days', () => {
    const daily = { '2026-10-31': day({ draft: 280 }), '2026-10-04': day({ draft: 560 }), '2026-10-03': day({ draft: 9999 }) }
    expect(paceOf(daily, 'draft', '2026-10-31')).toBe(30) // 840 over the days from Oct 4 to Oct 31; Oct 3 is outside
  })
  it('knows the week starts on Monday', () => {
    expect(weekOf('2026-10-31')).toBe('2026-10-26')
    expect(weekOf('2026-10-26')).toBe('2026-10-26')
    expect(weekOf('2026-11-01')).toBe('2026-10-26')
  })
  it('is behind when the pace will not make the deadline, and says what is needed', () => {
    const p = goalProgress(goal, { current: 52200, daily: { '2026-10-31': day({ draft: 412 }), '2026-10-30': day({ draft: 198 }) }, today: '2026-10-31' })
    expect(p.pct).toBe(58)
    expect(p.today).toBe(412)
    expect(p.week).toBe(610)
    expect(p.daysLeft).toBe(121)
    expect(p.needed).toBeCloseTo(37800 / 121)
    expect(p.status).toBe('behind')
    expect(p.finishes).not.toBeNull()
  })
  it('is ahead or on track by the pace against the pace needed', () => {
    const remaining = 90000 - 52200
    const needed = remaining / 121
    const at = (perDay: number) => goalProgress(goal, { current: 52200, daily: steady(perDay), today: '2026-10-31' }).status
    expect(at(needed * 1.3)).toBe('ahead')
    expect(at(needed * 1.0)).toBe('track')
    expect(at(needed * 0.5)).toBe('behind')
  })
  it('is done at the total, and has no status without a total or a deadline', () => {
    expect(goalProgress(goal, { current: 90000, daily: {}, today: '2026-10-31' }).status).toBe('done')
    const open = goalProgress({ ...goal, total: null, deadline: null }, { current: 5, daily: {}, today: '2026-10-31' })
    expect(open).toMatchObject({ status: null, pct: null, needed: null, finishes: null })
    const fallback = goalProgress({ ...goal, deadline: null }, { current: 0, daily: steady(1000), today: '2026-10-31', fallbackDeadline: '2027-01-01' })
    expect(fallback.deadline).toBe('2027-01-01')
  })
  it('draws the share done over time, and runs the projection on at the pace', () => {
    const daily = { '2026-10-29': day({ draft: 100 }), '2026-10-30': day({ draft: 100 }), '2026-10-31': day({ draft: 100 }) }
    const monthly = { '2026-09': month({ draft: 700 }) }
    const s = goalSeries('draft', { daily, monthly, today: '2026-10-31', current: 1000, total: 2000 })
    expect(s.points.map(p => [p.date, p.pct])).toEqual([['2026-09-30', 0.35], ['2026-10-29', 0.4], ['2026-10-30', 0.45], ['2026-10-31', 0.5]])
    expect(s.projection[0]).toEqual({ date: '2026-10-31', pct: 0.5 })
    expect(s.projection[1].pct).toBeLessThanOrEqual(1)
    expect(s.projection[1].date > '2026-10-31').toBe(true)
    const cut = goalSeries('draft', { daily, monthly, today: '2026-10-31', current: 1000, total: 2000, deadline: '2026-11-10' })
    expect(cut.projection[1].date).toBe('2026-11-10')
    expect(goalSeries('draft', { daily: {}, monthly: {}, today: '2026-10-31', current: 0, total: 10 }).projection).toEqual([])
  })
})

describe('recurrence', () => {
  it('adds months on the calendar and keeps to the end of a short one', () => {
    expect(addUnits('2026-01-31', 1, 'month')).toBe('2026-02-28')
    expect(addUnits('2026-10-15', 3, 'month')).toBe('2027-01-15')
    expect(addUnits('2026-10-15', 2, 'week')).toBe('2026-10-29')
    expect(addUnits('2026-12-31', 1, 'day')).toBe('2027-01-01')
  })
  it('repeats daily, every other day, weekly on chosen days and every other week', () => {
    expect(patternDays(rec({ kind: 'daily' }), '2026-10-05', '2026-10-08')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(patternDays(rec({ kind: 'daily', every: 2, anchor: '2026-10-05' }), '2026-10-05', '2026-10-10')).toEqual(['2026-10-05', '2026-10-07', '2026-10-09'])
    const weekdays = rec({ kind: 'weekly', days: [0, 2], anchor: '2026-10-05' }) // Mon and Wed
    expect(patternDays(weekdays, '2026-10-05', '2026-10-18')).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14'])
    const biweekly = rec({ kind: 'weekly', every: 2, days: [0], anchor: '2026-10-05' })
    expect(patternDays(biweekly, '2026-10-05', '2026-11-02')).toEqual(['2026-10-05', '2026-10-19', '2026-11-02'])
    expect(patternDays(rec({ kind: 'weekly', anchor: '2026-10-07' }), '2026-10-05', '2026-10-21')).toEqual(['2026-10-07', '2026-10-14', '2026-10-21']) // the anchor's weekday
  })
  it('stops at its end date and does not start before its anchor', () => {
    expect(patternDays(rec({ until: '2026-10-03', anchor: '2026-10-01' }), '2026-09-25', '2026-10-10')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(patternDays(rec({ kind: 'once', anchor: '2026-10-05' }), '2026-10-01', '2026-10-10')).toEqual(['2026-10-05'])
  })
  const shift = (o: Partial<Shift>): Shift => ({
    id: 's1', title: 'Draft', facet: 'draft', date: '2026-10-26', startSlot: 48, endSlot: 60, targetNodeId: null, targetTree: null, target: null,
    recurrence: null, pauses: [], skipped: [], overrides: {}, ...o,
  })
  it('holds a repeating shift except on pauses, skipped days and rest days, and applies a day\'s own changes', () => {
    const s = shift({
      recurrence: rec({ kind: 'weekly', days: [0, 1, 2, 3, 4], anchor: '2026-10-26' }), pauses: [{ start: '2026-10-28', end: '2026-10-28' }],
      skipped: ['2026-10-29'], overrides: { '2026-10-30': { startSlot: 54, endSlot: 66, title: 'Late draft' } },
    })
    const got = shiftOccurrences([s], [{ id: 'r', start: '2026-10-27', end: '2026-10-27', label: '' }], '2026-10-26', '2026-11-01')
    expect(got.map(o => [o.date, o.startSlot, o.endSlot, o.title])).toEqual([['2026-10-26', 48, 60, 'Draft'], ['2026-10-30', 54, 66, 'Late draft']])
    expect(got[0].repeats).toBe(true)
  })
  it('holds a one-off shift on its day only', () => {
    expect(shiftOccurrences([shift({})], [], '2026-10-27', '2026-11-01')).toEqual([])
    expect(shiftOccurrences([shift({})], [], '2026-10-26', '2026-10-26')).toHaveLength(1)
  })
  const routine = (o: Partial<Routine> & { recurrence: Recurrence }): Routine => ({ id: 'r1', label: 'Back up', facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null, ...o })
  it('puts an interval routine in its range, low priority, and overdue once past it', () => {
    const r = routine({ recurrence: rec({ kind: 'interval', every: 7, rangeMax: 10, unit: 'day', anchor: '2026-10-01' }), lastDone: '2026-10-20' })
    expect(routineWindow(r, '2026-10-26')).toMatchObject({ state: 'upcoming', from: '2026-10-27', to: '2026-10-30' })
    expect(routineWindow(r, '2026-10-27').state).toBe('inRange')
    expect(routineWindow(r, '2026-10-30').state).toBe('due') // the last day of the range
    expect(routineWindow(r, '2026-10-31')).toMatchObject({ state: 'overdue', day: 11 })
  })
  it('is due on the day an interval without a range comes round, and counts from the anchor when never done', () => {
    const r = routine({ recurrence: rec({ kind: 'interval', every: 2, unit: 'week', anchor: '2026-10-01' }) })
    expect(routineWindow(r, '2026-10-15').state).toBe('due')
    expect(routineWindow(r, '2026-10-14').state).toBe('upcoming')
    expect(routineWindow(r, '2026-10-16').state).toBe('overdue')
    const monthly = routine({ recurrence: rec({ kind: 'interval', every: 1, rangeMax: 2, unit: 'month', anchor: '2026-01-31' }), lastDone: '2026-01-31' })
    expect(routineWindow(monthly, '2026-02-28').state).toBe('inRange')
    expect(routineWindow(monthly, '2026-04-01').state).toBe('overdue')
  })
  it('pauses a routine for a length of time, and rests it on a rest day', () => {
    const r = routine({ recurrence: rec({ kind: 'daily' }), pauses: [{ start: '2026-10-10', end: '2026-10-12' }] })
    expect(routineWindow(r, '2026-10-11').state).toBe('paused')
    expect(routineWindow(r, '2026-10-13').state).toBe('due')
    expect(routineWindow(r, '2026-10-13', [{ id: 'x', start: '2026-10-13', end: '2026-10-13', label: '' }]).state).toBe('resting')
    const interval = routine({ recurrence: rec({ kind: 'interval', every: 7, unit: 'day' }), pauses: [{ start: '2026-10-20', end: '2026-10-30' }] })
    expect(routineWindow(interval, '2026-10-25').state).toBe('paused')
  })
})

describe('the ribbon', () => {
  const zeros = () => Object.fromEntries(FACETS.map(f => [f, Array(144).fill(0)])) as RibbonData['today']
  const data = (set: (today: RibbonData['today'], average: RibbonData['average']) => void): RibbonData => {
    const today = zeros()
    const average = zeros()
    set(today, average)
    return { date: '2026-10-31', today, average }
  }
  const occ = (startSlot: number, endSlot: number, facet: 'draft' | 'plot' = 'draft') => ({ shiftId: 's', date: '2026-10-31', title: 't', startSlot, endSlot, facet, target: null, repeats: false })

  it('compares today\'s events in a slot with the usual: higher, about the same, lower', () => {
    const d = data((t, a) => { t.draft[50] = 4; a.draft[50] = 2; t.draft[51] = 2; a.draft[51] = 2; t.draft[52] = 1; a.draft[52] = 2; t.draft[53] = 1 })
    expect([50, 51, 52, 53, 54].map(i => activityLevel(d.today, d.average, i))).toEqual(['high', 'avg', 'low', 'high', null])
  })
  it('takes the highest level when several facets were busy in a slot', () => {
    const d = data((t, a) => { t.draft[60] = 1; a.draft[60] = 4; t.plot[60] = 5; a.plot[60] = 1 })
    expect(activityLevel(d.today, d.average, 60)).toBe('high')
  })
  it('leaves idle slots idle, shows the future of a shift as scheduled, and a passed one with nothing in it as missed', () => {
    const d = data((t, a) => { t.draft[50] = 1; a.draft[50] = 1 })
    const slots = ribbonSlots(d, [occ(48, 56), occ(90, 100)], 86)
    expect(slots[40]).toBe('idle')
    expect(slots[50]).toBe('avg')
    expect([48, 49, 51, 55].map(i => slots[i])).toEqual(['missed', 'missed', 'missed', 'missed'])
    expect(slots[56]).toBe('idle')
    expect([90, 99].map(i => slots[i])).toEqual(['sched', 'sched'])
    expect(slots[100]).toBe('idle')
  })
  it('judges each slot by itself, not the whole shift', () => {
    const d = data(t => { t.plot[50] = 1 }) // work in another facet inside a draft shift still shows as work
    const slots = ribbonSlots(d, [occ(48, 52, 'draft')], 86)
    expect(slots.slice(48, 52)).toEqual(['missed', 'missed', 'high', 'missed'])
  })
  it('marks the slot the clock is in as now, whatever it holds, and draws shifts as scheduled while the activity has not loaded', () => {
    const d = data(t => { t.draft[86] = 3 })
    expect(ribbonSlots(d, [occ(80, 90)], 86)[86]).toBe('now')
    const unloaded = ribbonSlots(null, [occ(40, 44)], 86)
    expect(unloaded.slice(40, 44)).toEqual(['sched', 'sched', 'sched', 'sched'])
    expect(unloaded[86]).toBe('now')
  })
})

describe('the years over the monthly bars', () => {
  it('is one rectangle for each run of bars of a year, over its columns', () => {
    expect(barYears([{ key: '2024-11' }, { key: '2024-12' }, { key: '2025-01' }, { key: '2025-02' }, { key: '2025-03' }])).toEqual([
      { year: '2024', col: 1, span: 2 },
      { year: '2025', col: 3, span: 3 },
    ])
    expect(barYears([])).toEqual([])
  })
})
