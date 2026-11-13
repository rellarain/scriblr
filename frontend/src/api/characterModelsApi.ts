import { api } from './client'
import type { ModelCatalog, ModelDraftList, PublishedModelList, WriterModelLimits } from './types'

// The character models come in two libraries that answer the same way: the admin's catalog (the models Scriblr ships and the ones the admin designs, /character-models) and the
// writer's own (the models a writer designs for themselves, /my-models, whose ids start with "my-").
export interface ModelsApi {
  // The whole catalog as its page edits it: every model's draft, published copy and earlier versions.
  get(): Promise<ModelCatalog>
  // Saves the drafts in order; published copies and history are kept, and a model left out is deleted.
  put(drafts: ModelDraftList): Promise<ModelCatalog>
  // What the Writer's editor offers: the published copies only.
  published(): Promise<PublishedModelList>
  // Freezes the draft as the next published version.
  publish(modelId: string): Promise<ModelCatalog>
  // Takes the model out of the Writer's editor; its versions are kept.
  unpublish(modelId: string): Promise<ModelCatalog>
  // Puts the draft back to the published copy.
  discard(modelId: string): Promise<ModelCatalog>
  // Brings an earlier published version into the draft (it is not published again until Publish).
  restore(modelId: string, version: number): Promise<ModelCatalog>
}

const id = encodeURIComponent

function modelsApi(base: string): ModelsApi {
  return {
    get: () => api.get<ModelCatalog>(base),
    put: drafts => api.put<ModelCatalog>(base, drafts),
    published: () => api.get<PublishedModelList>(`${base}/published`),
    publish: modelId => api.post<ModelCatalog>(`${base}/${id(modelId)}/publish`),
    unpublish: modelId => api.post<ModelCatalog>(`${base}/${id(modelId)}/unpublish`),
    discard: modelId => api.post<ModelCatalog>(`${base}/${id(modelId)}/discard`),
    restore: (modelId, version) => api.post<ModelCatalog>(`${base}/${id(modelId)}/restore/${version}`),
  }
}

export const adminModelsApi: ModelsApi = modelsApi('/character-models')
// The writer's own models (the Characters console's Models section).
export const myModelsApi: ModelsApi = modelsApi('/my-models')

export const getModels = adminModelsApi.get
export const putModels = adminModelsApi.put
export const getPublishedModels = adminModelsApi.published
export const publishModel = adminModelsApi.publish
export const unpublishModel = adminModelsApi.unpublish
export const discardModelChanges = adminModelsApi.discard
export const restoreModelVersion = adminModelsApi.restore

// The limits the admin sets for the writer's own models (each at the admin's own limit until set), and setting them: the answer is what the server kept (held between each
// limit's floor and the admin's own limit).
export const getWriterLimits = (): Promise<WriterModelLimits> => api.get<WriterModelLimits>('/my-models/limits')
export const putWriterLimits = (limits: WriterModelLimits): Promise<WriterModelLimits> => api.put<WriterModelLimits>('/my-models/limits', limits)

// Adds the basic adult that comes with the app, published (409 when it is already in the catalog).
export function addBasicModel(): Promise<ModelCatalog> {
  return api.post<ModelCatalog>('/character-models/basic')
}

// Whether a newer basic adult came with this version of the app and waits because the admin had changed the basic model (phase O4a), and putting it in: the draft is
// replaced with the newer one and published as the next version (404 when there is no basic model).
export const basicUpdateAvailable = (): Promise<{ available: boolean }> => api.get<{ available: boolean }>('/character-models/basic/update')
export const updateBasicModel = (): Promise<ModelCatalog> => api.post<ModelCatalog>('/character-models/basic/update')
