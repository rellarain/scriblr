import { api } from './client'
import type { ModelCatalog, ModelDraftList, PublishedModelList } from './types'

// The whole catalog as the admin page edits it: every model's draft, published copy and earlier versions.
export function getModels(): Promise<ModelCatalog> {
  return api.get<ModelCatalog>('/character-models')
}

// Saves the drafts in order; published copies and history are kept, and a model left out is deleted.
export function putModels(drafts: ModelDraftList): Promise<ModelCatalog> {
  return api.put<ModelCatalog>('/character-models', drafts)
}

// What the Writer's editor offers: the published copies only.
export function getPublishedModels(): Promise<PublishedModelList> {
  return api.get<PublishedModelList>('/character-models/published')
}

// Adds the basic adult that comes with the app, published (409 when it is already in the catalog).
export function addBasicModel(): Promise<ModelCatalog> {
  return api.post<ModelCatalog>('/character-models/basic')
}

const id = encodeURIComponent

// Freezes the draft as the next published version.
export function publishModel(modelId: string): Promise<ModelCatalog> {
  return api.post<ModelCatalog>(`/character-models/${id(modelId)}/publish`)
}

// Takes the model out of the Writer's editor; its versions are kept.
export function unpublishModel(modelId: string): Promise<ModelCatalog> {
  return api.post<ModelCatalog>(`/character-models/${id(modelId)}/unpublish`)
}

// Puts the draft back to the published copy.
export function discardModelChanges(modelId: string): Promise<ModelCatalog> {
  return api.post<ModelCatalog>(`/character-models/${id(modelId)}/discard`)
}

// Brings an earlier published version into the draft (it is not published again until Publish).
export function restoreModelVersion(modelId: string, version: number): Promise<ModelCatalog> {
  return api.post<ModelCatalog>(`/character-models/${id(modelId)}/restore/${version}`)
}
