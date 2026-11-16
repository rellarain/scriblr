import { useEffect, useSyncExternalStore } from 'react'
import { staffFeedbackApi } from './feedbackApi'
import type { StaffBundle } from './feedbackTypes'

// The staff side of the feedback pipeline, shared by the Inbox, the Office's Voting and Channel Management, the Project Plan,
// Office > Assignment and the Inbox badge. The staff member acting is always the owner (universal access, 2026-11-16: no login yet,
// and the owner holds every role); tests may act as someone else. Changes are sent one at a time, in order, so quick edits (typing a
// note) cannot overtake each other; each answer is the whole bundle.

// The owner's staff id (backend storage/feedback.py OWNER_ID).
export const OWNER_ID = 'owner'
// Fired after staff change the feedback, so the writer's side reads it again.
export const FEEDBACK_CHANGED = 'scriblr:feedback'

export interface StaffState {
  adminId: string
  bundle: StaffBundle | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  // A load failure, or what the server said about the last change it refused.
  error: string | null
}

// The bundle with its lists always lists (an answer from an older or a stand-in server can leave them out).
const list = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])
const bundleOf = (b: StaffBundle): StaffBundle => ({
  ...b, admins: list(b?.admins), verbCategories: list(b?.verbCategories), messages: list(b?.messages), statements: list(b?.statements),
  roleHistory: list(b?.roleHistory), can: { check: !!b?.can?.check, manageVerbs: !!b?.can?.manageVerbs },
})

let state: StaffState = { adminId: OWNER_ID, bundle: null, status: 'idle', error: null }
const listeners = new Set<() => void>()
let queue: Promise<unknown> = Promise.resolve()

function set(next: Partial<StaffState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const getStaffState = () => state
export function subscribeStaff(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Loads the bundle for the admin acting (an unset admin gets the server's first one).
export async function loadStaff(): Promise<void> {
  set({ status: 'loading' })
  try {
    const bundle = bundleOf(await staffFeedbackApi.load(state.adminId))
    set({ bundle, adminId: bundle.me ?? state.adminId, status: 'ready', error: null })
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'The feedback could not be loaded.' })
  }
}

// Runs one change as the admin acting and replaces the bundle with the server's answer.
export function changeStaff(run: (adminId: string) => Promise<StaffBundle>): Promise<boolean> {
  const task = queue.then(async () => {
    try {
      const bundle = bundleOf(await run(state.adminId))
      set({ bundle, status: 'ready', error: null })
      // What a writer sees follows (their statuses, the questions asked of them).
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(FEEDBACK_CHANGED))
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'That could not be saved.' })
      return false
    }
  })
  queue = task
  return task
}

export const clearStaffError = () => set({ error: null })

// Something else changed the feedback (a user sent some, or answered a question): read it again.
export function refreshStaff() {
  if (state.status !== 'idle') void loadStaff()
}

export function __resetStaffForTests(adminId = OWNER_ID) {
  state = { adminId, bundle: null, status: 'idle', error: null }
  queue = Promise.resolve()
  listeners.forEach(l => l())
}

export function useStaff(): StaffState {
  const snapshot = useSyncExternalStore(subscribeStaff, getStaffState, getStaffState)
  useEffect(() => { if (getStaffState().status === 'idle') void loadStaff() }, [])
  return snapshot
}
