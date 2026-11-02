import { normalizePlanner, type Planner } from '../../../../lib/facets'
import { putPlanner } from './scheduleApi'

// Every project's planner as the consoles of the Dash share it. The backend replaces a project's whole planner on each save, so two consoles that each kept
// their own copy (the Schedule and the Project) would overwrite one another's changes; they read and write this one copy instead. A change is kept here at
// once and saved a moment after the last one.

const SAVE_DELAY_MS = 500

const planners = new Map<string, Planner>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pending = new Map<string, Planner>()
const listeners = new Set<() => void>()
let version = 0
let lastError: string | null = null

const emit = () => { version += 1; for (const l of listeners) l() }

function flush(projectId: string) {
  const next = pending.get(projectId)
  pending.delete(projectId)
  timers.delete(projectId)
  if (!next) return
  putPlanner(projectId, next).then(
    () => { if (lastError) { lastError = null; emit() } },
    (e: unknown) => { lastError = e instanceof Error ? e.message : 'Could not save the schedule.'; emit() },
  )
}

export const planStore = {
  subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } },
  // Changes whenever any planner or the error does (what useSyncExternalStore reads).
  version: (): number => version,
  error: (): string | null => lastError,
  get: (projectId: string): Planner | undefined => planners.get(projectId),
  // What the backend sent. A change that has not been saved yet is newer than that and is kept.
  load(projectId: string, fromServer: Partial<Planner>) {
    if (pending.has(projectId) && planners.has(projectId)) return
    planners.set(projectId, normalizePlanner(fromServer))
    emit()
  },
  // A change made in a console.
  set(projectId: string, next: Planner) {
    planners.set(projectId, next)
    pending.set(projectId, next)
    const old = timers.get(projectId)
    if (old) clearTimeout(old)
    timers.set(projectId, setTimeout(() => flush(projectId), SAVE_DELAY_MS))
    emit()
  },
  // Save what is waiting now (a console going away, the window closing).
  flush(projectIds?: string[]) {
    for (const [id, t] of [...timers]) {
      if (projectIds && !projectIds.includes(id)) continue
      clearTimeout(t)
      flush(id)
    }
  },
}

export function __resetPlanStoreForTests() {
  for (const t of timers.values()) clearTimeout(t)
  planners.clear(); timers.clear(); pending.clear(); listeners.clear()
  version = 0
  lastError = null
}
