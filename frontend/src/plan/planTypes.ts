// The app's own Project Plan (backend storage/project_plan.py, /api/project-plan): every node of the channel list has a plan of
// tasks, processes (sets of tasks), procedures (sets of processes and tasks) and routines (tasks that come back).

import type { Recurrence } from '../lib/facets'

export type PlanKind = 'task' | 'process' | 'procedure' | 'routine'
export type PlanStatus = 'todo' | 'claimed' | 'inProgress' | 'done'
export type PlanPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface PlanItem {
  id: string
  nodeId: string
  kind: PlanKind
  title: string
  notes: string
  parentId: string | null
  // A process or procedure whose parts are done in order.
  ordered: boolean
  order: number
  status: PlanStatus
  priority: PlanPriority
  start: string | null
  due: string | null
  assignee: { kind: 'staff'; id: string } | null
  claimedBy: string
  statementIds: string[]
  recurrence: Recurrence | null
  createdAt: string
  doneAt: string | null
  // What the staff member acting may do with it.
  can: { edit: boolean; status: boolean; claim: boolean }
}

export interface PlanView { me: string; items: PlanItem[] }

export interface NewItem {
  nodeId: string
  kind: PlanKind
  title: string
  parentId?: string | null
  ordered?: boolean
  priority?: PlanPriority
  start?: string | null
  due?: string | null
  assigneeId?: string | null
  statementIds?: string[]
  recurrence?: Recurrence | null
}

export type ItemPatch = Partial<{
  title: string
  notes: string
  parentId: string | null
  ordered: boolean
  status: PlanStatus
  priority: PlanPriority
  start: string | null
  due: string | null
  assigneeId: string | null
  statementIds: string[]
  recurrence: Recurrence | null
}>
