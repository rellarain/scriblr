import { useEffect, useSyncExternalStore } from 'react'
import { getStaffState, refreshStaff } from '../feedback/staffStore'
import { loadPlan, getPlanState } from '../plan/projectPlanStore'
import { staffApi } from './staffApi'
import type { StaffView } from './staffTypes'

// The staff roster and organisation, shared by the Office pages, Configuration > SLA, the Project Plan's assignee lists and
// Assignment's channel support. Changes act as the staff member in the Acting as chip, one at a time; each answer is the whole
// view. A change can rename someone the feedback knows, or move what the plan escalates, so both are read again after it.

export interface RosterState {
  view: StaffView | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

let state: RosterState = { view: null, status: 'idle', error: null }
const listeners = new Set<() => void>()
let queue: Promise<unknown> = Promise.resolve()

function set(next: Partial<RosterState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

const list = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])
const viewOf = (v: StaffView | null | undefined): StaffView => ({
  people: list(v?.people), departments: list(v?.departments), teams: list(v?.teams),
  sla: { urgent: 4, high: 24, normal: 72, low: 168, ...(v?.sla ?? {}) }, allotments: list(v?.allotments).length ? v!.allotments : [5, 10, 20, 30],
})

export const getRosterState = () => state
function subscribeRoster(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function loadRoster(): Promise<void> {
  set({ status: 'loading' })
  try {
    set({ view: viewOf(await staffApi.load()), status: 'ready', error: null })
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'The staff could not be loaded.' })
  }
}

export function changeRoster(run: (adminId: string) => Promise<StaffView>): Promise<boolean> {
  const task = queue.then(async () => {
    try {
      set({ view: viewOf(await run(getStaffState().adminId)), status: 'ready', error: null })
      refreshStaff()
      if (getPlanState().status !== 'idle') void loadPlan()
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'That could not be saved.' })
      return false
    }
  })
  queue = task
  return task
}

export const clearRosterError = () => set({ error: null })

export function __resetRosterForTests() {
  state = { view: null, status: 'idle', error: null }
  queue = Promise.resolve()
  listeners.forEach(l => l())
}

export function useRoster(): RosterState {
  const snapshot = useSyncExternalStore(subscribeRoster, getRosterState, getRosterState)
  useEffect(() => { if (getRosterState().status === 'idle') void loadRoster() }, [])
  return snapshot
}
