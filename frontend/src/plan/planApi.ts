import { api, type ApiHeaders } from '../api/client'
import type { ItemPatch, NewItem, PlanView } from './planTypes'

// The Project Plan routes (backend/app/api/project_plan.py). Every call names the staff member acting (X-Admin-Id, as the
// feedback routes do) and answers with the whole plan.

const as = (adminId: string): ApiHeaders | undefined => (adminId ? { 'X-Admin-Id': adminId } : undefined)
const id = encodeURIComponent

export const planApi = {
  load: (adminId: string) => api.get<PlanView>('/project-plan', as(adminId)),
  add: (adminId: string, item: NewItem) => api.post<PlanView>('/project-plan/items', item, as(adminId)),
  edit: (adminId: string, itemId: string, patch: ItemPatch) => api.patch<PlanView>(`/project-plan/items/${id(itemId)}`, patch, as(adminId)),
  remove: (adminId: string, itemId: string) => api.delete<PlanView>(`/project-plan/items/${id(itemId)}`, as(adminId)),
  reorder: (adminId: string, nodeId: string, parentId: string | null, orderedIds: string[]) =>
    api.put<PlanView>('/project-plan/items/reorder', { nodeId, parentId, orderedIds }, as(adminId)),
  claim: (adminId: string, itemId: string, release = false) => api.post<PlanView>(`/project-plan/items/${id(itemId)}/claim`, { release }, as(adminId)),
}
