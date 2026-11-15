// The staff (backend storage/staff.py, /api/staff): people, departments and teams, helper hours, console support, training and
// promotions, and the SLA.

export type PersonKind = 'helper' | 'admin'
export type Priority = 'urgent' | 'high' | 'normal' | 'low'

// Training a person finished on an interface or a console, and the director's promotion on it.
export interface TrainingRecord { nodeId: string; finishedAt: string; promotedBy: string | null; promotedAt: string | null }

export interface Person {
  id: string
  name: string
  kind: PersonKind
  active: boolean
  departmentId: string | null
  teamId: string | null
  // Helper hours a week (5, 10, 20 or 30), or none.
  allotment: number | null
  // The console queues (channel ids) the person supports.
  supports: string[]
  training: TrainingRecord[]
  // Worked out per console (1 a helper promoted on it, 2 a helper promoted on its interface, 3 its channel support, 4 an admin
  // with helper hours promoted on it); here the highest anywhere, null none.
  tier: 1 | 2 | 3 | 4 | null
}
export interface Department { id: string; name: string; directorId: string | null }
export interface Team { id: string; name: string; departmentId: string; managerId: string | null }

export interface StaffView {
  // The roster: by department, then tier, active above inactive, then by name.
  people: Person[]
  departments: Department[]
  teams: Team[]
  // Hours allowed per priority before plan work escalates.
  sla: Record<Priority, number>
  allotments: number[]
}

export type PersonPatch = Partial<Pick<Person, 'name' | 'kind' | 'active' | 'departmentId' | 'teamId' | 'allotment' | 'supports'>>
export type GroupPatch = Partial<{ name: string; directorId: string | null; managerId: string | null; departmentId: string }>
