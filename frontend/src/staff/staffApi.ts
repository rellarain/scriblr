import { api, type ApiHeaders } from '../api/client'
import type { GroupPatch, PersonKind, PersonPatch, Priority, StaffView } from './staffTypes'

// The staff routes (backend/app/api/staff.py). Changes name the staff member acting (X-Admin-Id) and answer with the whole view.

const as = (adminId: string): ApiHeaders | undefined => (adminId ? { 'X-Admin-Id': adminId } : undefined)
const id = encodeURIComponent

export const staffApi = {
  load: () => api.get<StaffView>('/staff'),
  hire: (a: string, body: { name: string; kind: PersonKind; departmentId?: string | null; teamId?: string | null }) => api.post<StaffView>('/staff/people', body, as(a)),
  editPerson: (a: string, pid: string, patch: PersonPatch) => api.patch<StaffView>(`/staff/people/${id(pid)}`, patch, as(a)),
  addDepartment: (a: string, name: string) => api.post<StaffView>('/staff/departments', { name }, as(a)),
  editDepartment: (a: string, did: string, patch: GroupPatch) => api.patch<StaffView>(`/staff/departments/${id(did)}`, patch, as(a)),
  removeDepartment: (a: string, did: string) => api.delete<StaffView>(`/staff/departments/${id(did)}`, as(a)),
  addTeam: (a: string, name: string, departmentId: string) => api.post<StaffView>('/staff/teams', { name, departmentId }, as(a)),
  editTeam: (a: string, tid: string, patch: GroupPatch) => api.patch<StaffView>(`/staff/teams/${id(tid)}`, patch, as(a)),
  removeTeam: (a: string, tid: string) => api.delete<StaffView>(`/staff/teams/${id(tid)}`, as(a)),
  setSla: (a: string, sla: Partial<Record<Priority, number>>) => api.put<StaffView>('/staff/sla', sla, as(a)),
}
