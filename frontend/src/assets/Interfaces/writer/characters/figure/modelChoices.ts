import { getPublishedModels, myModelsApi } from '../../../../../api/characterModelsApi'
import type { PublishedModelList, PublishedModelOut } from '../../../../../api/types'

// A published model a character can be drawn from, and whether it is one of the writer's own (from the Characters console's Models section).
export interface ModelChoice extends PublishedModelOut { mine: boolean }

// Every model a character can be drawn from: the published models of the catalog first, then the writer's own (each marked). A library that cannot be read leaves its models
// out, so the writer's own models never hide the catalog's, and the catalog failing is the one that says so.
export async function getModelChoices(): Promise<ModelChoice[]> {
  const [catalog, own] = await Promise.allSettled([getPublishedModels(), myModelsApi.published()])
  if (catalog.status === 'rejected') throw catalog.reason
  const list = (r: PublishedModelList | undefined) => (Array.isArray(r?.models) ? r.models : [])
  return [
    ...list(catalog.value).map(m => ({ ...m, mine: false })),
    ...list(own.status === 'fulfilled' ? own.value : undefined).map(m => ({ ...m, mine: true })),
  ]
}

// The name a picker shows for a model: its own name, and "(mine)" after one of the writer's.
export const choiceLabel = (m: ModelChoice): string => `${m.content.name || m.id}${m.mine ? ' (mine)' : ''}`
