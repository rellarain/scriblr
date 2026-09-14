import { api } from './client'
import type { AuiConfig } from './types'

export function getAdminConfig(): Promise<AuiConfig> {
  return api.get<AuiConfig>('/admin-config')
}

export function putAdminConfig(config: AuiConfig): Promise<AuiConfig> {
  return api.put<AuiConfig>('/admin-config', config)
}
