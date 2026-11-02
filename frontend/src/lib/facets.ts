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
// How soon a task matters: high comes first in the backlog, none waits in a fold.
export type TaskPriority = 'high' | 'medium' | 'low' | 'none'
export const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low', 'none']
export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' }
export interface Subtask { id: string; label: string; done: boolean }
export interface PlanItem {
  id: string
  label: string
  facet: Facet | null
  targetNodeId: string | null
  targetTree: 'outline' | 'plot' | null
  shiftId: string | null
  doneOn: string | null
  priority: TaskPriority
  dueDate: string | null
  notes: string
  estimateMinutes: number | null
  // An amount of the facet's work the task is for (words for a draft chapter, nodes for an outline or plot node), counted from `addedOn`.
  aim: number | null
  subtasks: Subtask[]
  addedOn: string | null
  // It was on a shift that ended with it undone, and came back to the backlog.
  carried: boolean
  // The phase it builds to, the milestone (a section of that phase) it is placed in, and the process it is a step of (a task made from a process when it is put on the Agenda).
  phaseId?: string | null
  milestoneId?: string | null
  processId?: string | null
  // The step it follows, in an ordered group of a process: it can be ticked once that one is.
  afterId?: string | null
}
// A new task: waiting in the backlog with no priority until it is given one.
export const newTask = (id: string, label: string, today: string | null, patch: Partial<PlanItem> = {}): PlanItem => ({
  id, label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, doneOn: null,
  priority: 'none', dueDate: null, notes: '', estimateMinutes: null, aim: null, subtasks: [], addedOn: today, carried: false, ...patch,
})
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
  phaseId?: string | null
  milestoneId?: string | null
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
  phaseId?: string | null
}
// A stage of the project, defined by the result it builds to. In a project it has real dates; in the template, an offset from the start and a length.
// It is on one row of the plan: the project's, or one of its books' or chapters' (`level`, and the book or chapter as `nodeId`). It sits in a sequence on its row
// (`order`), may be a pass of a kind of phase (`kindId`), and has its start pinned to its date when `fixed`. `overrides` are the fields of the kind it has changed.
export type PhaseLevel = 'project' | 'book' | 'chapter'
export const PHASE_LEVELS: PhaseLevel[] = ['project', 'book', 'chapter']
export const PHASE_LEVEL_LABEL: Record<PhaseLevel, string> = { project: 'Project', book: 'Book', chapter: 'Chapter' }
export type PhaseStatus = 'planned' | 'active' | 'done'
export const PHASE_STATUSES: PhaseStatus[] = ['planned', 'active', 'done']
export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { planned: 'Planned', active: 'Active', done: 'Done' }
export interface Phase {
  id: string
  title: string
  result: string
  description: string
  status: PhaseStatus
  start: string | null
  end: string | null
  offsetDays: number | null
  lengthDays: number | null
  level: PhaseLevel
  nodeId: string | null
  kindId: string | null
  order: number
  fixed: boolean
  overrides: string[]
}
// A section of a phase, reached by finishing the work placed in it: a deliverable (`result`), with a date or, in the sequence, a length; tickable by hand too.
// `kindMilestoneId` is the section of a kind it came from, and `overrides` the fields of it that were changed.
export interface Milestone {
  id: string
  title: string
  result: string
  date: string | null
  offsetDays: number | null
  phaseId: string | null
  done: boolean
  doneOn: string | null
  order: number
  lengthDays: number | null
  fixed: boolean
  kindMilestoneId: string | null
  overrides: string[]
}
// A recipe for a phase that comes round (a Revision pass): a pass starts from it and follows it in the fields it has not changed.
export interface PhaseKindMilestone { id: string; title: string; result: string; lengthDays: number | null }
export interface PhaseKind { id: string; title: string; result: string; description: string; lengthDays: number | null; milestones: PhaseKindMilestone[] }
export interface ProcessStep { id: string; label: string; estimateMinutes: number | null; facet: Facet | null }
// Steps done in order (one then the next) or in any order (a set to tick off).
export interface StepGroup { id: string; ordered: boolean; steps: ProcessStep[] }
// How a process relates to another: this one comes before or after it (ordered), or with it (unordered: related, or done at the same time).
export type ProcessRelation = 'before' | 'after' | 'with'
export const PROCESS_RELATIONS: ProcessRelation[] = ['before', 'after', 'with']
export const PROCESS_RELATION_LABEL: Record<ProcessRelation, string> = { before: 'Comes before', after: 'Comes after', with: 'Goes with' }
export interface ProcessLink { otherId: string; relation: ProcessRelation }
// A repeatable recipe of steps, for several phases and facets, which may need milestones done first.
export interface Process {
  id: string
  title: string
  description: string
  phaseIds: string[]
  // The milestones it is placed in.
  milestoneIds: string[]
  facets: Facet[]
  requiredMilestoneIds: string[]
  groups: StepGroup[]
  links: ProcessLink[]
}
// A writing drill: a prompt (the description), a length, how often it is suggested and how often it has been done.
export interface Exercise {
  id: string
  title: string
  description: string
  durationMinutes: number
  facets: Facet[]
  phaseIds: string[]
  milestoneIds: string[]
  perWeek: number | null
  timesDone: number
  lastDone: string | null
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
  // What the project is made of: the phases that build to its results, the milestones along them, the processes and exercises it uses.
  phases: Phase[]
  milestones: Milestone[]
  processes: Process[]
  exercises: Exercise[]
  // The recipes for phases that come round.
  phaseKinds: PhaseKind[]
}
export const emptyPlanner = (): Planner => ({
  timelineStart: null, timelineEnd: null, goals: [], shifts: [], routines: [], items: [], templates: [], restDays: [], reminderLeadMinutes: null,
  phases: [], milestones: [], processes: [], exercises: [], phaseKinds: [],
})
export const newPhase = (id: string, title: string, patch: Partial<Phase> = {}): Phase => ({
  id, title, result: '', description: '', status: 'planned', start: null, end: null, offsetDays: null, lengthDays: null, level: 'project', nodeId: null, kindId: null, order: 0, fixed: false, overrides: [], ...patch,
})
export const newMilestone = (id: string, title: string, patch: Partial<Milestone> = {}): Milestone => ({
  id, title, result: '', date: null, offsetDays: null, phaseId: null, done: false, doneOn: null, order: 0, lengthDays: null, fixed: false, kindMilestoneId: null, overrides: [], ...patch,
})
export const newProcess = (id: string, title: string, patch: Partial<Process> = {}): Process => ({ id, title, description: '', phaseIds: [], milestoneIds: [], facets: [], requiredMilestoneIds: [], groups: [], links: [], ...patch })
export const newExercise = (id: string, title: string, patch: Partial<Exercise> = {}): Exercise => ({ id, title, description: '', durationMinutes: 15, facets: [], phaseIds: [], milestoneIds: [], perWeek: null, timesDone: 0, lastDone: null, ...patch })
export const newPhaseKind = (id: string, title: string, patch: Partial<PhaseKind> = {}): PhaseKind => ({ id, title, result: '', description: '', lengthDays: null, milestones: [], ...patch })
// A planner as it was saved before phases, their levels and the rest existed (or the account's, kept as free JSON) lacks them: fill in what is missing.
export function normalizePlanner(p: Partial<Planner> | null | undefined): Planner {
  const base = { ...emptyPlanner(), ...p }
  return {
    ...base,
    phases: base.phases.map((x, i) => newPhase(x.id, x.title, { ...x, order: x.order ?? i })),
    milestones: base.milestones.map(x => newMilestone(x.id, x.title, x)),
    processes: base.processes.map(x => newProcess(x.id, x.title, x)),
    exercises: base.exercises.map(x => newExercise(x.id, x.title, x)),
  }
}

// 10-minute slots of the day.
export const SLOTS_PER_DAY = 144
export const slotTime = (slot: number): string => {
  const h = Math.floor(slot / 6) % 24
  const m = (slot % 6) * 10
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
