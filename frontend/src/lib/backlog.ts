import { PRIORITIES, type Facet, type PlanItem, type Planner, type Routine, type TaskPriority } from './facets'
import { routineWindow, shiftOccurrences, type RoutineWindow } from './recurrence'

// What the Backlog shows and in what order. Pure: the tile gives it the planners and the day and draws what comes back.
//   Today     the tasks on today's shifts (the shift running now first) and the routines due today
//   Overdue   tasks past their due date and routines past their range
//   High, Medium, Low   the tasks not on a shift, by priority (carried ones first, then by due date, then in the order they were added)
//   Routines  in range, paused, coming up
//   None      the tasks without a priority, in a fold that opens by itself when nothing else is waiting
// Any sort but "priority" lists the tasks flat in that order instead of by group.

export type SortMode = 'priority' | 'due' | 'newest' | 'manual'
export type DoneMode = 'hide' | 'today' | 'all'
export const SORT_MODES: SortMode[] = ['priority', 'due', 'newest', 'manual']
export const SORT_LABEL: Record<SortMode, string> = { priority: 'Priority', due: 'Due date', newest: 'Newest', manual: 'Manual' }
export const DONE_MODES: DoneMode[] = ['hide', 'today', 'all']
export const DONE_LABEL: Record<DoneMode, string> = { hide: 'Hide done', today: 'Done today', all: 'Show all' }

export interface BacklogFilter {
  search: string
  facet: Facet | null
  // An owner id (a project, or the account): null shows them all.
  project: string | null
  sort: SortMode
  done: DoneMode
}
export const DEFAULT_FILTER: BacklogFilter = { search: '', facet: null, project: null, sort: 'priority', done: 'today' }

export interface TaskEntry { kind: 'task'; ownerId: string; item: PlanItem; index: number }
export interface RoutineEntry { kind: 'routine'; ownerId: string; routine: Routine; w: RoutineWindow; ticked: boolean }
export type Entry = TaskEntry | RoutineEntry
export interface TodayTask extends TaskEntry { shiftTitle: string; running: boolean; done: boolean }
export type TodayEntry = TodayTask | RoutineEntry

export interface OrganiseInput {
  owners: { id: string; planner: Planner }[]
  today: string
  nowSlot: number
  filter: BacklogFilter
  // Whether an item (a routine, or a task on a repeating shift) is ticked off for today.
  ticked: (ownerId: string, id: string) => boolean
  // A node's name, so the search finds a task by the node it is about.
  nodeTitle?: (id: string) => string | undefined
}

export interface Organised {
  today: TodayEntry[]
  overdue: Entry[]
  // The priority groups (sort "priority"), each holding only its own tasks; the "none" group is the fold.
  groups: Record<TaskPriority, TaskEntry[]>
  // Every task in one list, in the sort's order (any sort but "priority").
  flat: TaskEntry[]
  routines: { inRange: RoutineEntry[]; paused: RoutineEntry[]; upcoming: RoutineEntry[] }
  done: TaskEntry[]
  // The None fold opens by itself: nothing else is waiting.
  noneOpen: boolean
  empty: boolean
}

export const isOverdueTask = (item: PlanItem, today: string): boolean => !item.doneOn && item.dueDate !== null && item.dueDate < today
const rank = (p: TaskPriority): number => PRIORITIES.indexOf(p)
const dueKey = (item: PlanItem): string => item.dueDate ?? '9999-99-99'

// A task of the first before a task of the second; ties fall to the order they are kept in.
function compareFor(sort: SortMode): (a: TaskEntry, b: TaskEntry) => number {
  const order = (a: TaskEntry, b: TaskEntry) => a.index - b.index
  if (sort === 'due') return (a, b) => dueKey(a.item).localeCompare(dueKey(b.item)) || rank(a.item.priority) - rank(b.item.priority) || order(a, b)
  if (sort === 'newest') return (a, b) => (b.item.addedOn ?? '').localeCompare(a.item.addedOn ?? '') || order(b, a)
  if (sort === 'manual') return order
  // Within a priority: carried back from a shift first, then the soonest due.
  return (a, b) => Number(b.item.carried) - Number(a.item.carried) || dueKey(a.item).localeCompare(dueKey(b.item)) || order(a, b)
}

function matches(text: string[], query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || text.some(t => t.toLowerCase().includes(q))
}

export function organise({ owners, today, nowSlot, filter, ticked, nodeTitle }: OrganiseInput): Organised {
  const title = (id: string | null) => (id ? nodeTitle?.(id) ?? '' : '')
  const taskText = (i: PlanItem) => [i.label, i.notes, title(i.targetNodeId), ...i.subtasks.map(s => s.label)]
  const keepOwner = (id: string) => !filter.project || filter.project === id
  const keepFacet = (f: Facet | null) => !filter.facet || f === filter.facet

  const tasks: TaskEntry[] = []
  const todayTasks: TodayTask[] = []
  const routineEntries: RoutineEntry[] = []
  for (const o of owners) {
    if (!keepOwner(o.id)) continue
    const todays = shiftOccurrences(o.planner.shifts, o.planner.restDays, today, today)
    const byShift = new Map(todays.map(s => [s.shiftId, s]))
    o.planner.items.forEach((item, index) => {
      if (!keepFacet(item.facet) || !matches(taskText(item), filter.search)) return
      const entry: TaskEntry = { kind: 'task', ownerId: o.id, item, index }
      if (item.shiftId) {
        const occ = byShift.get(item.shiftId)
        if (occ) todayTasks.push({ ...entry, shiftTitle: occ.title, running: occ.startSlot <= nowSlot && nowSlot < occ.endSlot, done: item.doneOn === today || ticked(o.id, item.id) })
        return
      }
      tasks.push(entry)
    })
    for (const routine of o.planner.routines) {
      if (!keepFacet(routine.facet) || !matches([routine.label, title(routine.targetNodeId)], filter.search)) continue
      const w = routineWindow(routine, today, o.planner.restDays)
      routineEntries.push({ kind: 'routine', ownerId: o.id, routine, w, ticked: routine.recurrence.kind === 'interval' ? routine.lastDone === today : ticked(o.id, routine.id) })
    }
  }

  // Done tasks follow the done choice; a done task is never also waiting.
  const shownDone = (item: PlanItem) => filter.done === 'all' || (filter.done === 'today' && item.doneOn === today)
  const waiting = tasks.filter(t => !t.item.doneOn)
  const done = tasks.filter(t => t.item.doneOn && shownDone(t.item)).sort((a, b) => (b.item.doneOn ?? '').localeCompare(a.item.doneOn ?? '') || a.index - b.index)

  // Today: the shift running now first, then the other shifts in time order, in each its tasks as kept; then the routines due today.
  const startOf = (shiftId: string, ownerId: string) => {
    const o = owners.find(x => x.id === ownerId)
    return shiftOccurrences(o?.planner.shifts ?? [], o?.planner.restDays ?? [], today, today).find(s => s.shiftId === shiftId)?.startSlot ?? 0
  }
  const shownTodayTask = (t: TodayTask) => !t.done || filter.done !== 'hide'
  const todayList: TodayEntry[] = [
    ...todayTasks.filter(shownTodayTask).sort((a, b) => Number(b.running) - Number(a.running) || startOf(a.item.shiftId as string, a.ownerId) - startOf(b.item.shiftId as string, b.ownerId) || a.index - b.index),
    ...routineEntries.filter(r => r.w.state === 'due' && (!r.ticked || filter.done !== 'hide')),
  ]

  // Overdue: the oldest due first, routines after the tasks.
  const overdueTasks = waiting.filter(t => isOverdueTask(t.item, today)).sort((a, b) => dueKey(a.item).localeCompare(dueKey(b.item)) || rank(a.item.priority) - rank(b.item.priority) || a.index - b.index)
  const overdue: Entry[] = [...overdueTasks, ...routineEntries.filter(r => r.w.state === 'overdue')]
  const late = new Set(overdueTasks.map(t => t.item.id))

  const groups: Record<TaskPriority, TaskEntry[]> = { high: [], medium: [], low: [], none: [] }
  const compare = compareFor(filter.sort)
  const rest = waiting.filter(t => filter.sort !== 'priority' || !late.has(t.item.id))
  for (const t of rest) groups[t.item.priority].push(t)
  for (const p of PRIORITIES) groups[p].sort(compare)
  const flat = filter.sort === 'priority' ? [] : waiting.slice().sort(compare)

  const routines = {
    inRange: routineEntries.filter(r => r.w.state === 'inRange'),
    paused: routineEntries.filter(r => r.w.state === 'paused'),
    upcoming: routineEntries.filter(r => r.w.state === 'upcoming' || r.w.state === 'resting'),
  }
  const othersWaiting = todayList.length + overdue.length + groups.high.length + groups.medium.length + groups.low.length + routines.inRange.length + routines.paused.length + routines.upcoming.length
  return {
    today: todayList, overdue, groups, flat, routines, done,
    noneOpen: othersWaiting === 0 && groups.none.length > 0,
    empty: othersWaiting + groups.none.length + done.length === 0,
  }
}

// The task `id` moved to just before `beforeId` (null = the end), within its own list; a place in another list leaves it where it is.
export function moveItem(items: PlanItem[], id: string, beforeId: string | null): PlanItem[] {
  const moving = items.find(i => i.id === id)
  if (!moving || id === beforeId) return items
  if (beforeId !== null && !items.some(i => i.id === beforeId)) return items
  const rest = items.filter(i => i.id !== id)
  const at = beforeId === null ? rest.length : rest.findIndex(i => i.id === beforeId)
  return [...rest.slice(0, at), moving, ...rest.slice(at)]
}
