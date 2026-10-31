// The Dash used to keep a task list, a routine list and a daily and weekly word goal in the settings store, on this machine. They become the
// account's planner: tasks and routines as items and daily routines, the word goals as a draft goal. Done once.

import { emptyPlanner, type Planner } from './facets'

export interface LegacyItem { id: string; label: string; done?: boolean }
export interface LegacyGoals { wordsPerDay?: number; wordsPerWeek?: number }

export interface Migrated { planner: Planner; ticked: string[] }

export function migrateLegacy(tasks: LegacyItem[] | undefined, routines: LegacyItem[] | undefined, goals: LegacyGoals | undefined, today: string): Migrated | null {
  const t = (tasks ?? []).filter(i => i && i.label)
  const r = (routines ?? []).filter(i => i && i.label)
  const wants = goals && (goals.wordsPerDay || goals.wordsPerWeek)
  if (t.length === 0 && r.length === 0 && !wants) return null
  const planner = emptyPlanner()
  planner.items = t.map(i => ({ id: i.id, label: i.label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, doneOn: i.done ? today : null }))
  planner.routines = r.map(i => ({
    id: i.id, label: i.label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null,
    recurrence: { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: today, until: null },
  }))
  if (wants) planner.goals = [{ id: 'goal_words', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: goals?.wordsPerDay ?? null, weekly: goals?.wordsPerWeek ?? null, total: null, deadline: null }]
  return { planner, ticked: r.filter(i => i.done).map(i => i.id) }
}
