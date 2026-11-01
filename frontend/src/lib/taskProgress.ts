import type { ActivityEvent, Facet, PlanItem } from './facets'

// How far a task has got: its subtasks ticked, or the work done on the node it is linked to against the aim it was given.

export interface Progress { done: number; total: number; pct: number }

const progress = (done: number, total: number): Progress => ({ done, total, pct: total > 0 ? Math.min(1, done / total) : 0 })

export function subtaskProgress(item: PlanItem): Progress | null {
  if (item.subtasks.length === 0) return null
  return progress(item.subtasks.filter(s => s.done).length, item.subtasks.length)
}

// The node and everything under it (the tree is a flat list with parent ids).
export function withDescendants(nodes: { id: string; parentId: string | null }[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) if (n.parentId && out.has(n.parentId) && !out.has(n.id)) { out.add(n.id); grew = true }
  }
  return out
}

// What counts as one unit of a facet's work in the activity: words written, or nodes added, or flags resolved.
export const COUNTED: Record<Facet, ActivityEvent['action']> = { draft: 'words', outline: 'create', plot: 'create', revision: 'resolve', project: 'create' }

// The facet a task counts its node's work in: its own, or the writing of an outline node and the adding of a plot node.
export const facetOfTask = (item: PlanItem): Facet => item.facet ?? (item.targetTree === 'plot' ? 'plot' : 'draft')

// The work done on a task's node (and what is under it) since the task was added, against its aim. `covered` is the node's ids (withDescendants).
export function nodeProgress(item: PlanItem, events: ActivityEvent[], covered: Set<string>): Progress | null {
  if (!item.aim || !item.targetNodeId) return null
  const facet = facetOfTask(item)
  let sum = 0
  for (const e of events) {
    if (e.facet !== facet || e.action !== COUNTED[facet] || !e.nodeId || !covered.has(e.nodeId)) continue
    if (item.addedOn && e.date < item.addedOn) continue
    sum += facet === 'draft' ? e.amount : Math.max(0, e.amount)
  }
  return progress(Math.max(0, sum), item.aim)
}

// The one bar a task shows: its node's if it has an aim, else its subtasks'.
export function progressOf(item: PlanItem, events: ActivityEvent[], covered: Set<string> | null): Progress | null {
  return (covered ? nodeProgress(item, events, covered) : null) ?? subtaskProgress(item)
}
