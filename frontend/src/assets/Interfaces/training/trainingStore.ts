import { useSyncExternalStore } from 'react'
import * as api from '../../../api/trainingApi'
import type { TrainingContentDraft, TrainingState } from '../../../api/types'
import { getKv, setKv } from '../../../settings/settingsStore'

// Training's data, shared by every level: the courses and one learner's progress, both kept by the backend. Each action answers with the new
// state, which replaces the old one (nothing is shown before the server has said so). Where the user is in the levels, and the Min/Mid toggles,
// are not here: they are this machine's (useTrainingState.ts).

export interface TrainingData {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  training: TrainingState | null
  // What the last action that failed said; cleared by the next one that works.
  actionError: string | null
}

const EMPTY: TrainingData = { status: 'idle', error: null, training: null, actionError: null }
let data: TrainingData = EMPTY
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function set(next: Partial<TrainingData>): void {
  data = { ...data, ...next }
  listeners.forEach(fn => fn())
}

export const subscribeTraining = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const getTrainingData = (): TrainingData => data
export const useTraining = (): TrainingData => useSyncExternalStore(subscribeTraining, getTrainingData)

// Before the courses were kept by the backend, the courses a user enrolled in were this machine's (`scriblr.training.enrolled`). They are
// carried over once, when the backend has none, and the old value is cleared.
const OLD_ENROLLED_KEY = 'scriblr.training.enrolled'
async function importOldEnrolment(state: TrainingState): Promise<TrainingState> {
  const old = getKv<string[]>(OLD_ENROLLED_KEY)
  if (!Array.isArray(old) || old.length === 0) return state
  let next = state
  if (Object.keys(state.progress.enrolled).length === 0) {
    const known = new Set(state.content.courses.map(c => c.id))
    for (const id of old) if (known.has(id)) next = await api.enrol(id)
  }
  setKv(OLD_ENROLLED_KEY, [])
  return next
}

export function loadTraining(force = false): Promise<void> {
  if (inflight) return inflight
  if (data.status === 'ready' && !force) return Promise.resolve()
  if (data.status !== 'ready') set({ status: 'loading', error: null })
  inflight = api.getTraining()
    .then(importOldEnrolment)
    .then(training => set({ status: 'ready', error: null, training }))
    .catch((e: unknown) => set({ status: 'error', error: e instanceof Error ? e.message : 'Training could not be loaded.' }))
    .finally(() => { inflight = null })
  return inflight
}

async function act(call: () => Promise<TrainingState>): Promise<void> {
  try {
    const training = await call()
    set({ training, actionError: null })
  } catch (e) {
    set({ actionError: e instanceof Error ? e.message : 'That could not be saved.' })
  }
}

export const enrol = (courseId: string) => act(() => api.enrol(courseId))
export const leave = (courseId: string) => act(() => api.leave(courseId))
export const setCompleted = (itemId: string, done: boolean) => act(() => (done ? api.setCompleted(itemId) : api.clearCompleted(itemId)))
export const recordAttempt = (assessmentId: string, score: number) => act(() => api.recordAttempt(assessmentId, score))
export const saveContent = (draft: TrainingContentDraft) => act(() => api.saveTrainingContent(draft))

// For tests: start again from nothing.
export function __resetTrainingForTests(): void {
  data = EMPTY
  inflight = null
  listeners.clear()
}
