import type { PlanItem, PlanKind, PlanPriority, PlanStatus } from './planTypes'

// Pure helpers for the Project Plan's pages.

export const KIND_LABEL: Record<PlanKind, string> = { task: 'Task', process: 'Process', procedure: 'Procedure', routine: 'Routine' }
export const STATUS_LABEL: Record<PlanStatus, string> = { todo: 'To do', claimed: 'Claimed', inProgress: 'In progress', done: 'Done' }
export const PRIORITY_LABEL: Record<PlanPriority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }
export const STATUSES: PlanStatus[] = ['todo', 'claimed', 'inProgress', 'done']
export const PRIORITIES: PlanPriority[] = ['urgent', 'high', 'normal', 'low']
const PRIORITY_RANK: Record<PlanPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

// What each kind may hold (as the server checks it).
export const HOLDS: Record<PlanKind, PlanKind[]> = { procedure: ['process', 'task'], process: ['task'], task: [], routine: [] }
// What may be added at the top of a node's plan.
export const TOP_KINDS: PlanKind[] = ['procedure', 'process', 'task', 'routine']

// The items of one level of a node's plan, in order.
export const childrenOf = (items: PlanItem[], nodeId: string, parentId: string | null): PlanItem[] =>
  items.filter(i => i.nodeId === nodeId && i.parentId === parentId).sort((a, b) => a.order - b.order)

export function descendantsOf(items: PlanItem[], id: string): PlanItem[] {
  const out: PlanItem[] = []
  const stack = [id]
  while (stack.length) {
    const pid = stack.pop()!
    for (const i of items) if (i.parentId === pid) { out.push(i); stack.push(i.id) }
  }
  return out
}

// How far a process or procedure has got: its tasks done of its tasks (null with none).
export function progressOf(items: PlanItem[], id: string): { done: number; total: number } | null {
  const tasks = descendantsOf(items, id).filter(i => i.kind === 'task' || i.kind === 'routine')
  return tasks.length ? { done: tasks.filter(t => t.status === 'done').length, total: tasks.length } : null
}

// Items per node (for the tree's counts), open ones only.
export function openCounts(items: PlanItem[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const i of items) if (i.status !== 'done') out.set(i.nodeId, (out.get(i.nodeId) ?? 0) + 1)
  return out
}

// The new order of a level after moving `id` before `beforeId` (null: last).
export function movedBefore(ids: string[], id: string, beforeId: string | null): string[] {
  const rest = ids.filter(x => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  return at < 0 ? ids : [...rest.slice(0, at), id, ...rest.slice(at)]
}

const byUrgency = (a: PlanItem, b: PlanItem) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title)

// My work: what is mine (assigned to me or claimed by me) and not done, most urgent first; then what I could claim (nobody's,
// not done); then what I finished.
export function myWork(items: PlanItem[], me: string): { mine: PlanItem[]; open: PlanItem[]; done: PlanItem[] } {
  const isMine = (i: PlanItem) => i.assignee?.id === me || i.claimedBy === me
  return {
    mine: items.filter(i => isMine(i) && i.status !== 'done').sort(byUrgency),
    open: items.filter(i => !isMine(i) && !i.assignee && !i.claimedBy && i.status !== 'done' && i.kind !== 'procedure' && i.kind !== 'process').sort(byUrgency),
    done: items.filter(i => isMine(i) && i.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
  }
}

// The Board's columns.
export function boardColumns(items: PlanItem[]): Record<PlanStatus, PlanItem[]> {
  const out: Record<PlanStatus, PlanItem[]> = { todo: [], claimed: [], inProgress: [], done: [] }
  for (const i of items) out[i.status].push(i)
  for (const s of STATUSES) out[s].sort(byUrgency)
  return out
}

// The next status along (Done stays done).
export const nextStatus = (s: PlanStatus): PlanStatus => STATUSES[Math.min(STATUSES.indexOf(s) + 1, STATUSES.length - 1)]

// --- the Timeline ---------------------------------------------------------------

const DAY = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY)

// `lane`: bars that overlap in time go on lanes of their own, one under the other.
export interface TimelineBar { item: PlanItem; left: number; width: number; lane: number }
export interface TimelineRow { nodeId: string; bars: TimelineBar[]; lanes: number }

// Dated items (a start, a due date or both; one date makes a one-day bar) as bars by node, on a scale from the earliest date to
// the latest (and today, when given), in percent of its width.
export function timeline(items: PlanItem[], today?: string): { from: string; to: string; days: number; rows: TimelineRow[]; todayAt: number | null } | null {
  const dated = items.filter(i => i.start || i.due)
  if (dated.length === 0) return null
  const spans = dated.map(i => {
    const a = i.start ?? i.due!, b = i.due ?? i.start!
    return { item: i, a, b: b < a ? a : b }
  })
  let from = spans.reduce((m, s) => (s.a < m ? s.a : m), spans[0].a)
  let to = spans.reduce((m, s) => (s.b > m ? s.b : m), spans[0].b)
  if (today) { if (today < from) from = today; if (today > to) to = today }
  const days = daysBetween(from, to) + 1
  const pct = (n: number) => (n / days) * 100
  const rows = new Map<string, TimelineBar[]>()
  const laneEnds = new Map<string, string[]>()
  for (const s of spans.sort((x, y) => x.a.localeCompare(y.a) || y.b.localeCompare(x.b))) {
    const ends = laneEnds.get(s.item.nodeId) ?? []
    let lane = ends.findIndex(end => end < s.a)
    if (lane < 0) lane = ends.length
    ends[lane] = s.b
    laneEnds.set(s.item.nodeId, ends)
    const bar = { item: s.item, left: pct(daysBetween(from, s.a)), width: pct(daysBetween(s.a, s.b) + 1), lane }
    rows.set(s.item.nodeId, [...(rows.get(s.item.nodeId) ?? []), bar])
  }
  return {
    from, to, days,
    rows: [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nodeId, bars]) => ({ nodeId, bars, lanes: Math.max(...bars.map(b => b.lane)) + 1 })),
    todayAt: today && today >= from && today <= to ? pct(daysBetween(from, today) + 0.5) : null,
  }
}
