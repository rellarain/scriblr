import { api } from './client'
import type { OutlineSnapshotDetail, PlotSnapshotDetail, RevisionSnapshot, RevisionSummary, SettingsLogEntry, TreeSnapshotSummary } from '../types'

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
export const getProjectSettingsLog = (projectId: string) => api.get<SettingsLogEntry[]>(`/projects/${enc(projectId)}/settings-log`)
export const getUserSettingsLog = () => api.get<SettingsLogEntry[]>('/user-settings/activity')
