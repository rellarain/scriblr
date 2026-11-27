import { api } from './client'
import type { ChapterRevisionSummary, DiffOp, OutlineSnapshotDetail, PlotSnapshotDetail, RevisionSnapshot, RevisionSummary, SettingsLogEntry, TreeSnapshotSummary } from '../types'

// Plain fetches of the history behind Undo: the outline and plot snapshots, a chapter's revisions, and the settings logs.
const enc = encodeURIComponent

export const listOutlineHistory = (projectId: string) => api.get<TreeSnapshotSummary[]>(`/projects/${enc(projectId)}/outline/history`)
export const getOutlineSnapshot = (projectId: string, id: string) => api.get<OutlineSnapshotDetail>(`/projects/${enc(projectId)}/outline/history/${enc(id)}`)
export const listPlotHistory = (projectId: string) => api.get<TreeSnapshotSummary[]>(`/projects/${enc(projectId)}/plot/history`)
export const getPlotSnapshot = (projectId: string, id: string) => api.get<PlotSnapshotDetail>(`/projects/${enc(projectId)}/plot/history/${enc(id)}`)
export const listRevisionSummaries = (projectId: string, chapterId: string) =>
  api.get<RevisionSummary[]>(`/projects/${enc(projectId)}/revisions/${enc(chapterId)}`)
export const getRevisionSnapshot = (projectId: string, chapterId: string, id: string) =>
  api.get<RevisionSnapshot>(`/projects/${enc(projectId)}/revisions/${enc(chapterId)}/${enc(id)}`)
// The project's History tab: every chapter's revisions, one moment's text then against now (or another revision), and putting a chapter back as
// it was in a revision (the backend keeps the chapter as it is first, "Before revert to ...").
export const listProjectRevisions = (projectId: string) => api.get<ChapterRevisionSummary[]>(`/projects/${enc(projectId)}/revision-summaries`)
export const getRevisionDiff = (projectId: string, chapterId: string, momentId: string, from: string, to = 'current') =>
  api.get<{ ops: DiffOp[] }>(`/projects/${enc(projectId)}/revisions/${enc(chapterId)}/diff?momentId=${enc(momentId)}&from=${enc(from)}&to=${enc(to)}`)
export const revertRevision = (projectId: string, chapterId: string, snapshotId: string) =>
  api.post<RevisionSnapshot>(`/projects/${enc(projectId)}/revisions/${enc(chapterId)}/${enc(snapshotId)}/revert`, {})
export const getProjectSettingsLog = (projectId: string) => api.get<SettingsLogEntry[]>(`/projects/${enc(projectId)}/settings-log`)
export const getUserSettingsLog = () => api.get<SettingsLogEntry[]>('/user-settings/activity')
