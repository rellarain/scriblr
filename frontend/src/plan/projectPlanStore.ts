import { useEffect, useSyncExternalStore } from 'react'
import { getStaffState, refreshStaff, subscribeStaff } from '../feedback/staffStore'
import { planApi } from './planApi'
import type { PlanView } from './planTypes'

// The Project Plan, shared by its four pages (Plan, My work, Timeline, Board). It acts as the staff member chosen in the feedback
// screens' Acting as chip (feedback/staffStore.ts) and loads again when that changes. Changes are sent one at a time, in order;
// each answer is the whole plan. A change can move what writers see of their feedback, so the feedback is read again after it.

export interface PlanState {
  view: PlanView | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

let state: PlanState = { view: null, status: 'idle', error: null }
let actingFor = ''
const listeners = new Set<() => void>()
let queue: Promise<unknown> = Promise.resolve()

function set(next: Partial<PlanState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

const viewOf = (v: PlanView | null | undefined): PlanView => ({ me: v?.me ?? '', items: Array.isArray(v?.items) ? v.items : [] })

export const getPlanState = () => state
function subscribePlan(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function loadPlan(): Promise<void> {
  actingFor = getStaffState().adminId
  set({ status: 'loading' })
  try {
    set({ view: viewOf(await planApi.load(actingFor)), status: 'ready', error: null })
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'The plan could not be loaded.' })
  }
}

// Runs one change as the staff member acting and replaces the plan with the server's answer.
export function changePlan(run: (adminId: string) => Promise<PlanView>): Promise<boolean> {
  const task = queue.then(async () => {
    try {
      set({ view: viewOf(await run(getStaffState().adminId)), status: 'ready', error: null })
      refreshStaff()
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'That could not be saved.' })
      return false
    }
  })
  queue = task
  return task
}

export const clearPlanError = () => set({ error: null })

export function __resetPlanForTests() {
  state = { view: null, status: 'idle', error: null }
  actingFor = ''
  queue = Promise.resolve()
  listeners.forEach(l => l())
}

export function usePlan(): PlanState {
  const snapshot = useSyncExternalStore(subscribePlan, getPlanState, getPlanState)
  useEffect(() => {
    if (getPlanState().status === 'idle') void loadPlan()
    // Acting as someone else: their plan (what they may do differs).
    return subscribeStaff(() => { if (getStaffState().adminId !== actingFor && getPlanState().status !== 'idle') void loadPlan() })
  }, [])
  return snapshot
}
