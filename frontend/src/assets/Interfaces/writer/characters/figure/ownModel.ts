import { createContext, useContext } from 'react'
import { getWriterLimits, myModelsApi } from '../../../../../api/characterModelsApi'
import type { FigureModel } from '../../../../../api/types'
import { MY_ID_PREFIX, copyName, normalizeContent, randomId } from '../../../admin/characters/modelContent'
import { libraryFull, normalizeWriterLimits } from '../../../admin/characters/engine/writerLimits'

// Opening one of the writer's own models in My models, from the figure editor (Edit this model). The Characters console provides the function that opens it; without one (a page
// that is not the console) the button is not offered.
export const OpenMyModelContext = createContext<((modelId: string) => void) | null>(null)
export const useOpenMyModel = (): ((modelId: string) => void) | null => useContext(OpenMyModelContext)

// Whether a model a character is drawn from is one of the writer's own (their ids all start with "my-").
export const isOwnModel = (modelId: string): boolean => modelId.startsWith(MY_ID_PREFIX)

// The model in the writer's library that Edit this model opens for a character's model. A model of their own that is still in the library opens as it is (its draft may be
// ahead of the character's copy). Anything else, a model of Scriblr's or one of theirs that was deleted, is copied from the character's own copy of it: a draft of their own,
// named so that it does not repeat a name in the library, that they publish when it is ready and choose with Use this model. Refused when the library is full.
export async function ownCopyOf(model: FigureModel): Promise<string> {
  const catalog = await myModelsApi.get()
  if (isOwnModel(model.modelId) && catalog.models.some(e => e.id === model.modelId)) return model.modelId
  const limits = normalizeWriterLimits(await getWriterLimits().catch(() => null))
  if (catalog.models.length >= limits.models) throw new Error(`${libraryFull(limits.models)} Delete one in My models first.`)
  const id = `${MY_ID_PREFIX}${randomId('model')}`
  const draft = { ...normalizeContent(structuredClone(model.content)), name: copyName(model.content.name, catalog.models) }
  await myModelsApi.put({ models: [...catalog.models.map(e => ({ id: e.id, draft: e.draft })), { id, draft }] })
  return id
}
