import type { Tone } from '../helperTypes'
import type { FeedbackChannel, FeedbackStatement, InboxBundle, Role, VoteInput } from './feedbackTypes'

// Calls to /api/feedback. There is no login yet: the signed-in admin's id travels in the
// X-Admin-Id header and the server trusts it. Every call returns the whole Inbox bundle.

export class FeedbackApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call(adminId: string, method: string, path: string, body?: unknown): Promise<InboxBundle> {
  const response = await fetch(`/api/feedback${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Id': adminId },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const json = await response.json()
      detail = typeof json.detail === 'string' ? json.detail : 'That could not be saved.'
    } catch { /* no JSON body */ }
    throw new FeedbackApiError(response.status, detail)
  }
  return (await response.json()) as InboxBundle
}

const id = encodeURIComponent

export const feedbackApi = {
  load: (admin: string) => call(admin, 'GET', ''),
  validate: (admin: string, messageId: string, patch: { tone?: Tone; channels?: FeedbackChannel[]; statements?: FeedbackStatement[] }) =>
    call(admin, 'PUT', `/messages/${id(messageId)}/validation`, patch),
  voteCase: (admin: string, caseId: string, vote: VoteInput) => call(admin, 'PUT', `/cases/${id(caseId)}/vote`, vote),
  voteSolution: (admin: string, caseId: string, solutionId: string, vote: VoteInput) =>
    call(admin, 'PUT', `/cases/${id(caseId)}/solutions/${id(solutionId)}/vote`, vote),
  propose: (admin: string, caseId: string, solution: { title: string; description: string; target: Omit<FeedbackChannel, 'feature'> & { feature?: string } }) =>
    call(admin, 'POST', `/cases/${id(caseId)}/solutions`, solution),
  close: (admin: string, caseId: string, outcome: 'approved' | 'rejected', note: string) =>
    call(admin, 'POST', `/cases/${id(caseId)}/close`, { outcome, note }),
  reopen: (admin: string, caseId: string) => call(admin, 'POST', `/cases/${id(caseId)}/reopen`),
  setRoles: (admin: string, targetId: string, console: string, roles: Role[]) =>
    call(admin, 'PUT', `/admins/${id(targetId)}/roles`, { console, roles }),
  addVerb: (admin: string, name: string, keywords: string[]) => call(admin, 'POST', '/verb-categories', { name, keywords }),
  updateVerb: (admin: string, verbId: string, patch: { name?: string; keywords?: string[] }) =>
    call(admin, 'PATCH', `/verb-categories/${id(verbId)}`, patch),
  deleteVerb: (admin: string, verbId: string) => call(admin, 'DELETE', `/verb-categories/${id(verbId)}`),
}
