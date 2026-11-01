// What the Schedule console shows in the design system: a year of activity, a few months before it, goals with a deadline, shifts, routines and
// today's slots. All of it is relative to today, so the page always looks lived in; none of it is real.

import { emptyDay, emptyPlanner, FACETS, newTask, type DayTotals, type FacetActivityData, type Planner, type RibbonData } from '../lib/facets'
import { addDays } from '../lib/projection'

const noise = (n: number, s: number): number => { const x = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x) }
export const localDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function facetsFixture(today: string, bookId: string): FacetActivityData {
  const daily: Record<string, DayTotals> = {}
  for (let i = 0; i < 380; i += 1) {
    const ramp = 0.5 + 0.5 * (1 - i / 380)
    const day = emptyDay()
    if (noise(i, 1) < 0.78 * ramp) { day.draft = Math.round(80 + noise(i, 2) * 700); day.books = { [bookId]: day.draft } }
    if (noise(i, 3) < 0.34) { day.outline = Math.round(1 + noise(i, 4) * 6); day.kinds = noise(i, 5) < 0.3 ? { chapter: 1 } : { scene: 1 } }
    if (noise(i, 6) < 0.3) day.plot = Math.round(1 + noise(i, 7) * 4)
    if (noise(i, 8) < 0.2) { day.revision = 2; day.flagsApplied = 1; day.flagsResolved = 1 }
    if (noise(i, 9) < 0.5) day.project = Math.round(1 + noise(i, 10) * 3)
    daily[addDays(today, -i)] = day
  }
  const monthly: FacetActivityData['monthly'] = {}
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  for (let k = 1; k <= 8; k += 1) {
    const t = y * 12 + (m - 1) - 13 - k
    const key = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
    const draft = Math.round(8000 + noise(k, 1) * 20000)
    monthly[key] = { ...emptyDay(), draft, outline: Math.round(20 + noise(k, 2) * 80), plot: Math.round(10 + noise(k, 3) * 40), revision: Math.round(noise(k, 4) * 20), project: Math.round(noise(k, 5) * 30), books: { [bookId]: draft }, activeDays: Math.round(10 + noise(k, 6) * 15) }
  }
  return { today, events: [], daily, monthly }
}

export function plannerFixture(today: string): Planner {
  const shift = (id: string, title: string, facet: Planner['shifts'][number]['facet'], date: string, startSlot: number, endSlot: number, extra: Partial<Planner['shifts'][number]> = {}) => ({
    id, title, facet, date, startSlot, endSlot, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {}, ...extra,
  })
  return {
    ...emptyPlanner(),
    timelineStart: addDays(today, -290),
    timelineEnd: addDays(today, 121),
    goals: [
      { id: 'g1', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: 500, weekly: 3000, total: 90000, deadline: addDays(today, 121) },
      { id: 'g2', facet: 'outline', scope: 'project', nodeId: null, kind: null, daily: 6, weekly: 40, total: 240, deadline: addDays(today, 30) },
      { id: 'g3', facet: 'plot', scope: 'project', nodeId: null, kind: null, daily: 2, weekly: null, total: 60, deadline: null },
    ],
    shifts: [
      shift('s1', 'Morning draft', 'draft', addDays(today, -14), 48, 72, { target: 800, recurrence: { kind: 'weekly', every: 1, unit: 'day', days: [0, 1, 2, 3, 4], rangeMax: null, anchor: addDays(today, -14), until: null } }),
      shift('s2', 'Afternoon plotting', 'plot', today, 90, 102),
      shift('s3', 'Revise flags', 'revision', today, 115, 123),
    ],
    routines: [
      { id: 'r1', label: 'Export a backup', facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: addDays(today, -8), recurrence: { kind: 'interval', every: 7, unit: 'day', days: [], rangeMax: 10, anchor: addDays(today, -60), until: null } },
      { id: 'r2', label: 'Review character sheets', facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: addDays(today, -30), recurrence: { kind: 'interval', every: 2, unit: 'week', days: [], rangeMax: 3, anchor: addDays(today, -90), until: null } },
    ],
    items: [
      newTask('i1', 'Reread Ch. 8 notes', today, { facet: 'draft', priority: 'high', dueDate: addDays(today, 1), estimateMinutes: 45, subtasks: [{ id: 'st1', label: 'Chapter 8', done: true }, { id: 'st2', label: 'Chapter 9', done: false }] }),
      newTask('i2', 'Fix Ch. 4 plot point order', today, { facet: 'plot', priority: 'medium' }),
      newTask('i3', 'Sketch the harbour map', today),
    ],
  }
}

export function ribbonFixture(today: string): RibbonData {
  const zeros = () => Object.fromEntries(FACETS.map(f => [f, Array<number>(144).fill(0)])) as RibbonData['today']
  const now = zeros()
  const avg = zeros()
  const slots = [...Array.from({ length: 10 }, (_, i) => 48 + i), ...Array.from({ length: 9 }, (_, i) => 63 + i), ...Array.from({ length: 6 }, (_, i) => 78 + i)]
  slots.forEach((slot, i) => { now.draft[slot] = 1 + (i % 4); avg.draft[slot] = 2 })
  return { date: today, today: now, average: avg }
}
