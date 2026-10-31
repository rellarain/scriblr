// The project facets the Schedule console tracks, and the shapes the backend sends for them (backend/app/storage/schema.py: FacetActivity, Planner).

export type Facet = 'outline' | 'plot' | 'draft' | 'revision' | 'project'
export const FACETS: Facet[] = ['outline', 'plot', 'draft', 'revision', 'project']
export const FACET_LABEL: Record<Facet, string> = { outline: 'Outline', plot: 'Plot', draft: 'Draft', revision: 'Revision', project: 'Project' }
// What one unit of a facet's activity is, for tooltips and goals.
export const FACET_UNIT: Record<Facet, { one: string; many: string }> = {
  outline: { one: 'node', many: 'nodes' },
  plot: { one: 'plot node', many: 'plot nodes' },
  draft: { one: 'word', many: 'words' },
  revision: { one: 'flag', many: 'flags' },
  project: { one: 'item', many: 'items' },
}
export const unitOf = (facet: Facet, n: number): string => (n === 1 ? FACET_UNIT[facet].one : FACET_UNIT[facet].many)

export interface DayTotals {
  outline: number
  plot: number
  draft: number
  revision: number
  project: number
  flagsApplied: number
  flagsResolved: number
  books: Record<string, number>
  kinds: Record<string, number>
}
export interface MonthTotals extends DayTotals {
  activeDays: number
}
export interface ActivityEvent {
  ts: string
  date: string
  slot: number
  facet: Facet
  action: 'create' | 'edit' | 'delete' | 'words' | 'flag' | 'resolve' | 'tick' | 'setting'
  nodeId: string | null
  kind: string | null
  label: string | null
  amount: number
}
export interface FacetActivityData {
  today: string
  events: ActivityEvent[]
  daily: Record<string, DayTotals>
  monthly: Record<string, MonthTotals>
}
export interface RibbonData {
  date: string
  today: Record<Facet, number[]>
  average: Record<Facet, number[]>
}

// What a day counts for a facet: words are net, so a day that cut words counts none.
export function dayValue(day: DayTotals | undefined, facet: Facet): number {
  if (!day) return 0
  return facet === 'draft' ? Math.max(0, day.draft) : day[facet]
}

export const emptyDay = (): DayTotals => ({ outline: 0, plot: 0, draft: 0, revision: 0, project: 0, flagsApplied: 0, flagsResolved: 0, books: {}, kinds: {} })

// ---- the planner ----

export type RecurrenceKind = 'once' | 'daily' | 'weekly' | 'interval'
export type RecurrenceUnit = 'day' | 'week' | 'month'
export interface Recurrence {
  kind: RecurrenceKind
  every: number
  unit: RecurrenceUnit
  days: number[] // 0 = Monday .. 6 = Sunday
  rangeMax: number | null
  anchor: string
  until: string | null
}
export interface Pause { start: string; end: string }
export interface ShiftOverride { title?: string | null; startSlot?: number | null; endSlot?: number | null }
export interface PlanItem {
  id: string
  label: string
  facet: Facet | null
  targetNodeId: string | null
  targetTree: 'outline' | 'plot' | null
  shiftId: string | null
  doneOn: string | null
}
export interface Routine {
  id: string
  label: string
  facet: Facet | null
  targetNodeId: string | null
  targetTree: 'outline' | 'plot' | null
  shiftId: string | null
  recurrence: Recurrence
  pauses: Pause[]
  lastDone: string | null
}
export interface Shift {
  id: string
  title: string
  facet: Facet
  date: string
  startSlot: number
  endSlot: number
  targetNodeId: string | null
  targetTree: 'outline' | 'plot' | null
  target: number | null
  recurrence: Recurrence | null
  pauses: Pause[]
  skipped: string[]
  overrides: Record<string, ShiftOverride>
}
export interface ShiftTemplate { id: string; name: string; facet: Facet; startSlot: number; endSlot: number; target: number | null; days: number[] }
export interface Goal {
  id: string
  facet: Facet
  scope: 'project' | 'book' | 'chapter'
  nodeId: string | null
  kind: string | null
  daily: number | null
  weekly: number | null
  total: number | null
  deadline: string | null
}
export interface RestRange { id: string; start: string; end: string; label: string }
export interface Planner {
  schemaVersion?: number
  timelineStart: string | null
  timelineEnd: string | null
  goals: Goal[]
  shifts: Shift[]
  routines: Routine[]
  items: PlanItem[]
  templates: ShiftTemplate[]
  restDays: RestRange[]
  reminderLeadMinutes: number | null
}
export const emptyPlanner = (): Planner => ({
  timelineStart: null, timelineEnd: null, goals: [], shifts: [], routines: [], items: [], templates: [], restDays: [], reminderLeadMinutes: null,
})

// 10-minute slots of the day.
export const SLOTS_PER_DAY = 144
export const slotTime = (slot: number): string => {
  const h = Math.floor(slot / 6) % 24
  const m = (slot % 6) * 10
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
