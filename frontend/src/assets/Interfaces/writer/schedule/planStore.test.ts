import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyPlanner, newPhase, type Planner } from '../../../../lib/facets'
import { mockFetchBy } from '../../../../test/mockFetch'
import { planStore } from './planStore'

let fetchMock: ReturnType<typeof mockFetchBy>
let failNext = false
// The saves sent so far (read from the calls, so they are there the moment the timer fires, before the answer is read).
const puts = () => fetchMock.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT').map(c => ({ url: String(c[0]), body: JSON.parse(String((c[1] as RequestInit).body)) as Planner }))

beforeEach(() => {
  vi.useFakeTimers()
  failNext = false
  fetchMock = mockFetchBy((_url, init) => {
    if (init?.method === 'PUT' && failNext) { failNext = false; throw new Error('Nope') } // (the answer is read when the body is, so the save fails there)
    return {}
  })
})
afterEach(() => { vi.useRealTimers() })

describe('planStore', () => {
  it('shows a change made in one console to every other at once, and saves it once, a moment later', () => {
    const seen = vi.fn()
    const off = planStore.subscribe(seen)
    const next = { ...emptyPlanner(), phases: [newPhase('ph', 'Draft')] }
    planStore.set('p1', next)
    planStore.set('p1', { ...next, phases: [newPhase('ph', 'First draft')] })
    expect(planStore.get('p1')?.phases[0].title).toBe('First draft')
    expect(seen).toHaveBeenCalledTimes(2)
    expect(puts()).toHaveLength(0)
    vi.advanceTimersByTime(500)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].url).toMatch(/\/projects\/p1\/planner$/)
    expect(puts()[0].body.phases[0].title).toBe('First draft')
    off()
  })

  it('does not let what the backend sent overwrite a change that is not saved yet', () => {
    planStore.set('p2', { ...emptyPlanner(), phases: [newPhase('ph', 'Mine')] })
    planStore.load('p2', emptyPlanner())
    expect(planStore.get('p2')?.phases).toHaveLength(1)
    vi.advanceTimersByTime(500)
    planStore.load('p2', emptyPlanner())
    expect(planStore.get('p2')?.phases).toHaveLength(0) // saved: the backend's copy is the current one
  })

  it('fills in what an older planner did not have', () => {
    planStore.load('p3', { timelineStart: null } as never)
    expect(planStore.get('p3')).toMatchObject({ phases: [], milestones: [], processes: [], exercises: [] })
  })

  it('saves what is waiting on flush, only for the projects named', () => {
    planStore.set('p4', emptyPlanner())
    planStore.set('p5', emptyPlanner())
    planStore.flush(['p4'])
    expect(puts().map(p => p.url.split('/').at(-2))).toEqual(['p4'])
    vi.advanceTimersByTime(500)
    expect(puts().map(p => p.url.split('/').at(-2))).toEqual(['p4', 'p5'])
  })

  it('keeps the error of a save that failed until one succeeds', async () => {
    failNext = true
    planStore.set('p6', emptyPlanner())
    planStore.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(planStore.error()).toBeTruthy()
    planStore.set('p6', emptyPlanner())
    planStore.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(planStore.error()).toBeNull()
  })
})
