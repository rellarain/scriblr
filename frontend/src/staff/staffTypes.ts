// The staff (backend storage/staff.py, /api/staff): people, departments and teams, helper hours, console support and the SLA.

export type PersonKind = 'helper' | 'admin'
export type Priority = 'urgent' | 'high' | 'normal' | 'low'

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
  // Worked out: 1 a helper, 2 channel support, 3 an admin with helper time; null none.
  tier: 1 | 2 | 3 | null
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
