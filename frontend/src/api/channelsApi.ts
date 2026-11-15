import { api } from './client'
import type { ResourceNode } from './types'

// The channel list (interface > console > component > feature) alone, without the Resources content. It is edited
// through the Resources node routes (resourcesApi.ts), which answer with the whole file.
export function getChannels(): Promise<{ nodes: ResourceNode[] }> {
  return api.get<{ nodes: ResourceNode[] }>('/channels')
}
