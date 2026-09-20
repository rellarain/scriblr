import { useEffect, useSyncExternalStore } from 'react'
import { feedbackApi } from './feedbackApi'
import type { InboxBundle } from './feedbackTypes'

// The Inbox's data, shared by the Inbox panel and the badge on the Inbox button. The
// signed-in admin (for testing, chosen in the Inbox; no login yet) is remembered in this
// browser. Changes are sent one at a time, in order, so quick edits (typing a note) cannot
// overtake each other.

const ADMIN_KEY = 'scriblr.helper.adminId'

export interface FeedbackState {
  adminId: string
  bundle: InboxBundle | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  // A load failure, or what the server said about the last change it refused.
  error: string | null
}

function storedAdmin(): string {
  try { return localStorage.getItem(ADMIN_KEY) ?? '' } catch { return '' }
}

let state: FeedbackState = { adminId: storedAdmin(), bundle: null, status: 'idle', error: null }
const listeners = new Set<() => void>()
let queue: Promise<unknown> = Promise.resolve()

function set(next: Partial<FeedbackState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const getFeedbackState = () => state
export function subscribeFeedback(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Loads the bundle for the current admin (an unset admin gets the server's first one).
export async function loadFeedback(): Promise<void> {
  set({ status: 'loading' })
  try {
    const bundle = await feedbackApi.load(state.adminId)
    set({ bundle, adminId: bundle.me, status: 'ready', error: null })
  } catch (err) {
    set({ status: 'error', error: err instanceof Error ? err.message : 'The inbox could not be loaded.' })
  }
}

export function setFeedbackAdmin(adminId: string) {
  try { localStorage.setItem(ADMIN_KEY, adminId) } catch { /* private window */ }
  set({ adminId, error: null })
  void loadFeedback()
}

// Runs one change as the signed-in admin and replaces the bundle with the server's answer.
export function changeFeedback(run: (adminId: string) => Promise<InboxBundle>): Promise<boolean> {
  const task = queue.then(async () => {
    try {
      const bundle = await run(state.adminId)
      set({ bundle, status: 'ready', error: null })
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'That could not be saved.' })
      return false
    }
  })
  queue = task
  return task
}

export const clearFeedbackError = () => set({ error: null })

// Test hook: back to a blank store.
export function resetFeedbackStore(adminId = '') {
  state = { adminId, bundle: null, status: 'idle', error: null }
  queue = Promise.resolve()
  listeners.forEach(l => l())
}

export function useFeedback(): FeedbackState {
  const snapshot = useSyncExternalStore(subscribeFeedback, getFeedbackState, getFeedbackState)
  useEffect(() => { if (getFeedbackState().status === 'idle') void loadFeedback() }, [])
  return snapshot
}
