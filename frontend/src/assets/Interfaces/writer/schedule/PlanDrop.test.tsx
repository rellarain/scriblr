import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { emptyDay, emptyPlanner, newExercise, newMilestone, newPhase, newProcess, type Planner, type Routine } from '../../../../lib/facets'
import { DRAG_PLAN, type PlanDrag } from '../../../../lib/planDrop'
import ScheduleConsole from './ScheduleConsole'

// Routines, processes and exercises dragged from the Project tab onto the Agenda (lib/planDrop.ts has the rules; this is the Agenda taking them).

const TODAY = '2026-10-31'
const step = (id: string, label: string, estimateMinutes: number | null) => ({ id, label, estimateMinutes, facet: null })
const routine: Routine = {
  id: 'r1', label: 'Export a backup', facet: 'project', targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null,
  recurrence: { kind: 'weekly', every: 1, unit: 'week', days: [0, 3], rangeMax: null, anchor: '2026-09-01', until: null },
}

function planner(): Planner {
  return {
    ...emptyPlanner(),
    phases: [newPhase('ph', 'First draft', { start: '2026-10-28', end: '2026-11-04' })],
    milestones: [newMilestone('m1', 'Outline locked', { date: TODAY, done: true }), newMilestone('m2', 'Half way', { date: '2026-11-30' })],
    shifts: [{ id: 's1', title: 'Morning draft', facet: 'draft', date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {} }],
    routines: [routine],
    processes: [
      newProcess('pr1', 'Revise a chapter', { requiredMilestoneIds: ['m1'], groups: [{ id: 'g', ordered: true, steps: [step('a', 'Reread', 30), step('b', 'Mark', 20)] }] }),
      newProcess('pr2', 'Proof a chapter', { requiredMilestoneIds: ['m2'], groups: [{ id: 'g', ordered: true, steps: [step('c', 'Proof', 30)] }] }),
    ],
    exercises: [newExercise('ex1', 'Ten-minute sprint', { description: 'Write without stopping.', durationMinutes: 10, facets: ['draft'] })],
  }
}

let saved: Planner[]
afterEach(() => { vi.useRealTimers() })
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 8, 0))
  window.localStorage.clear()
  __resetSettingsForTests()
  saved = []
  mockFetchBy((url, init) => {
    if (url.endsWith('/activity/facets')) return { today: TODAY, events: [], daily: { [TODAY]: { ...emptyDay(), draft: 100 } }, monthly: {} }
    if (url.endsWith('/planner')) {
      if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)) as Planner; saved.push(body); return body }
      return planner()
    }
    if (url.endsWith('/analytics')) return { totals: { totalWordCount: 0 }, nodeWordCounts: {} }
    if (url.endsWith('/outline') || url.endsWith('/plot')) return { nodes: [] }
    if (url.includes('/schedule/')) return []
    return {}
  })
})

const open = async () => {
  render(<ScheduleConsole scope="project" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
  await screen.findByRole('button', { name: /^Morning draft/ })
}
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const payload = (kind: PlanDrag['kind'], id: string) => ({ dataTransfer: { getData: (t: string) => (t === DRAG_PLAN ? JSON.stringify({ ownerId: 'p1', kind, id }) : '') } })
// A drop at a height (jsdom's drop event has no clientY of its own).
const dropAt = (el: HTMLElement, kind: PlanDrag['kind'], id: string, clientY: number) => {
  const e = createEvent.drop(el, payload(kind, id))
  Object.defineProperty(e, 'clientY', { value: clientY })
  fireEvent(el, e)
}
const column = () => document.querySelector(`.wrSchedCol[data-date="${TODAY}"]`) as HTMLElement
const lastSaved = async (check: (p: Planner) => boolean) => { await waitFor(() => expect(saved.some(check)).toBe(true), { timeout: 3000 }); return saved.filter(check).at(-1) as Planner }

describe('putting the Project tab on the Agenda', () => {
  it('makes a repeating shift of a routine dropped on empty time, from that day, with the routine on it', async () => {
    await open()
    dropAt(column(), 'routine', 'r1', 1080) // 54 slots of 20px: nine in the morning
    const got = await lastSaved(p => p.shifts.length === 2)
    const shift = got.shifts.find(s => s.id !== 's1')!
    expect(shift).toMatchObject({ title: 'Export a backup', facet: 'project', date: TODAY, startSlot: 54 })
    expect(shift.recurrence).toMatchObject({ kind: 'weekly', days: [0, 3], anchor: TODAY })
    expect(got.routines[0].shiftId).toBe(shift.id)
  })

  it('makes a shift of a process, whose checklist is its steps, the second ticked only after the first', async () => {
    await open()
    dropAt(column(), 'process', 'pr1', 1800)
    const got = await lastSaved(p => p.items.length === 2)
    const made = got.shifts.find(s => s.id !== 's1')!
    expect(made).toMatchObject({ title: 'Revise a chapter', startSlot: 90, endSlot: 95 })
    expect(got.items.map(i => [i.label, i.shiftId === made.id, i.processId, i.afterId === got.items[0].id])).toEqual([['Reread', true, 'pr1', false], ['Mark', true, 'pr1', true]])
    // The second step is shown but cannot be ticked while the first is not.
    const today = await within(tile('backlog')).findByRole('region', { name: /^Today/ })
    expect((within(today).getByRole('checkbox', { name: 'Reread' }) as HTMLInputElement).disabled).toBe(false)
    expect((within(today).getByRole('checkbox', { name: 'Mark' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('refuses a process that needs a milestone that is not done, and says which', async () => {
    await open()
    dropAt(column(), 'process', 'pr2', 1800)
    expect((await screen.findByRole('status')).textContent).toMatch(/Proof a chapter needs Half way done first\./)
    expect(saved).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('puts the steps of a process on a shift it is dropped on', async () => {
    await open()
    fireEvent.drop(await within(tile('schedule')).findByRole('button', { name: /^Morning draft/ }), payload('process', 'pr1'))
    const got = await lastSaved(p => p.items.length === 2)
    expect(got.shifts).toHaveLength(1)
    expect(got.items.every(i => i.shiftId === 's1')).toBe(true)
  })

  it('makes a timed shift of an exercise, with the prompt in the notes of its one task', async () => {
    await open()
    dropAt(column(), 'exercise', 'ex1', 1080)
    const got = await lastSaved(p => p.items.length === 1)
    const made = got.shifts.find(s => s.id !== 's1')!
    expect(made).toMatchObject({ title: 'Ten-minute sprint', facet: 'draft', startSlot: 54, endSlot: 57 })
    expect(got.items[0]).toMatchObject({ label: 'Ten-minute sprint', notes: 'Write without stopping.', estimateMinutes: 10, shiftId: made.id })
  })

  it('marks the milestones and the ends of phases on their days', async () => {
    await open()
    const marks = Array.from(tile('schedule').querySelectorAll('.wrSchedDeadline')).map(m => m.textContent)
    expect(marks).toEqual(expect.arrayContaining(['Done: Outline locked', 'Phase starts: First draft']))
  })
})
