import { api, type ApiHeaders } from '../api/client'
import type { Decision, MessageEdit, MineView, Role, SendInput, StaffBundle, VerbCategory, VoteInput } from './feedbackTypes'

// The feedback routes (backend/app/api/feedback.py). The user's side needs no admin; every staff call names the admin acting
// (X-Admin-Id; no login yet) and answers with the whole staff bundle.

const as = (adminId: string): ApiHeaders | undefined => (adminId ? { 'X-Admin-Id': adminId } : undefined)
const id = encodeURIComponent

export const userFeedbackApi = {
  mine: (authorId: string) => api.get<MineView>(`/feedback/mine?authorId=${id(authorId)}`),
  verbs: () => api.get<VerbCategory[]>('/feedback/verbs'),
  send: (input: SendInput) => api.post<{ id: string; submittedAt: string }>('/feedback/messages', input),
  answer: (authorId: string, messageId: string, questionId: string, answer: string) =>
    api.put<MineView>(`/feedback/messages/${id(messageId)}/questions/${id(questionId)}/answer`, { authorId, answer }),
}

export const staffFeedbackApi = {
  load: (adminId: string) => api.get<StaffBundle>('/feedback', as(adminId)),
  edit: (adminId: string, messageId: string, edit: MessageEdit) => api.put<StaffBundle>(`/feedback/messages/${id(messageId)}`, edit, as(adminId)),
  ask: (adminId: string, messageId: string, text: string) => api.post<StaffBundle>(`/feedback/messages/${id(messageId)}/questions`, { text }, as(adminId)),
  comment: (adminId: string, messageId: string, text: string) => api.post<StaffBundle>(`/feedback/messages/${id(messageId)}/comments`, { text }, as(adminId)),
  vote: (adminId: string, statementId: string, vote: VoteInput) => api.put<StaffBundle>(`/feedback/statements/${id(statementId)}/vote`, vote, as(adminId)),
  decide: (adminId: string, statementId: string, decision: Decision | null, note: string) =>
    api.post<StaffBundle>(`/feedback/statements/${id(statementId)}/decision`, { decision, note }, as(adminId)),
  setRoles: (adminId: string, targetId: string, scope: string, roles: Role[]) =>
    api.put<StaffBundle>(`/feedback/admins/${id(targetId)}/roles`, { scope, roles }, as(adminId)),
  addVerb: (adminId: string, name: string, keywords: string[]) => api.post<StaffBundle>('/feedback/verb-categories', { name, keywords }, as(adminId)),
  updateVerb: (adminId: string, verbId: string, patch: { name?: string; keywords?: string[] }) =>
    api.patch<StaffBundle>(`/feedback/verb-categories/${id(verbId)}`, patch, as(adminId)),
  deleteVerb: (adminId: string, verbId: string) => api.delete<StaffBundle>(`/feedback/verb-categories/${id(verbId)}`, as(adminId)),
}
