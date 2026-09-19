import { api } from './client'
import type { AuiConfig, AuiConfigDraft } from './types'

export function getAdminConfig(): Promise<AuiConfig> {
  return api.get<AuiConfig>('/admin-config')
}

// Saves the draft; the published copies are untouched.
export function putAdminConfig(draft: AuiConfigDraft): Promise<AuiConfig> {
  return api.put<AuiConfig>('/admin-config', draft)
}

// Freezes one tab's current draft as its published copy.
export function publishAdminTab(tab: string): Promise<AuiConfig> {
  return api.post<AuiConfig>(`/admin-config/publish/${encodeURIComponent(tab)}`)
}
