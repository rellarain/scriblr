import { api } from './client'
import type {
  PromotableFeedbackMessage, ResourceFaqEntry, ResourceNodeKind, ResourceQuestion, ResourceTutorial, ResourcesFile,
} from './types'

const id = encodeURIComponent

export function getResources(): Promise<ResourcesFile> {
  return api.get<ResourcesFile>('/resources')
}

export function addResourceNode(parentId: string | null, kind: ResourceNodeKind, name = ''): Promise<ResourcesFile> {
  return api.post<ResourcesFile>('/resources/nodes', { parentId, kind, name })
}

export function renameResourceNode(nodeId: string, name: string): Promise<ResourcesFile> {
  return api.put<ResourcesFile>(`/resources/nodes/${id(nodeId)}/name`, { name })
}

export function reorderResourceNodes(parentId: string | null, orderedIds: string[]): Promise<ResourcesFile> {
  return api.put<ResourcesFile>('/resources/nodes/reorder', { parentId, orderedIds })
}

export function deleteResourceNode(nodeId: string): Promise<ResourcesFile> {
  return api.delete<ResourcesFile>(`/resources/nodes/${id(nodeId)}`)
}

export function putResourceGuide(nodeId: string, guide: string): Promise<ResourcesFile> {
  return api.put<ResourcesFile>(`/resources/nodes/${id(nodeId)}/guide`, { guide })
}

export function putResourceTutorials(nodeId: string, tutorials: ResourceTutorial[]): Promise<ResourcesFile> {
  return api.put<ResourcesFile>(`/resources/nodes/${id(nodeId)}/tutorials`, { tutorials })
}

export function putResourceFaq(nodeId: string, faq: ResourceFaqEntry[]): Promise<ResourcesFile> {
  return api.put<ResourcesFile>(`/resources/nodes/${id(nodeId)}/faq`, { faq })
}

export function putResourceAssessment(nodeId: string, questions: ResourceQuestion[]): Promise<ResourcesFile> {
  return api.put<ResourcesFile>(`/resources/nodes/${id(nodeId)}/assessment`, { questions })
}

export function getPromotableFeedback(nodeId: string): Promise<PromotableFeedbackMessage[]> {
  return api.get<PromotableFeedbackMessage[]>(`/resources/nodes/${id(nodeId)}/promotable-feedback`)
}

export interface SubmitFeedbackInput {
  author: string
  text: string
  senderTone: 'pleasant' | 'unpleasant' | 'mixed' | 'neutral' | null
  openPage?: string | null
  openConsole?: string | null
  selectedComponent?: string | null
}

// Reuses the Helper Inbox's own submission endpoint (backend/app/api/feedback.py) --
// unlike every other /api/feedback route, it needs no signed-in admin.
export function submitFeedback(input: SubmitFeedbackInput): Promise<{ id: string; submittedAt: string }> {
  return api.post<{ id: string; submittedAt: string }>('/feedback/messages', input)
}
