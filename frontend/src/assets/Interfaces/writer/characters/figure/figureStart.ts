import { useEffect, useState } from 'react'
import type { CharacterFigure, ModelGenre, PublishedModelOut } from '../../../../../api/types'
import { genresOf } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import { ensureFigureModel } from './figureModelStore'
import { blankFigure, rollFigure } from './figureState'
import { getModelChoices, type ModelChoice } from './modelChoices'

// How a new character starts (phase 6c-5): as a mannequin of the basic model, with a first look rolled within a genre, instead of the plain portrait. The basic model is the one the
// app comes with (published on a fresh install); when it is not published (the admin took it away) a new character starts with the portrait, as before, and the Portrait section can
// still make a mannequin from any published model. Nothing here adds or publishes a model: that is the admin's. Phase 7 lets the writer pick another published model to start from (one
// of their own, or any of the catalog's): a Start with dropdown by the plus, remembered, which falls back to the basic model when the one picked is gone.

export const START_MODEL_ID = 'basic'
// Where the genre and the model chosen beside the plus are remembered.
export const START_GENRE_KEY = 'scriblr.characters.startGenre'
export const START_MODEL_KEY = 'scriblr.characters.startModel'

// The model a new character starts on, among the published ones: the one asked for, else the basic model, else none.
export const startModelOf = <T extends PublishedModelOut>(models: T[] | null | undefined, wanted: string = START_MODEL_ID): T | null =>
  (models ?? []).find(m => m.id === wanted) ?? (models ?? []).find(m => m.id === START_MODEL_ID) ?? null

const seed = () => Math.floor(Math.random() * 0x100000000)

// The first figure of a new character: the project's copy of the start model (the basic one unless `modelId` is another published model; made once, shared by every character that
// uses it) and a look rolled within `genre` (null or a genre the model does not have: any). Null when there is no model to start from. Rejects when the models cannot be read or the
// copy cannot be made (the caller falls back).
export async function startFigure(projectId: string, genre: string | null, rngSeed: number = seed(), modelId: string = START_MODEL_ID): Promise<CharacterFigure | null> {
  const model = startModelOf(await getModelChoices(), modelId)
  if (!model) return null
  const copy = await ensureFigureModel(projectId, { modelId: model.id })
  const wanted = genre && genresOf(copy.content).some(g => g.id === genre) ? genre : null
  return rollFigure(copy.content, { ...blankFigure(copy.id, copy.content), genre: wanted }, seededRng(rngSeed))
}

// What the dropdowns beside the plus offer: every published model (empty until they are read, and when none can be read), and the genres of the one a new character would start on
// (`wanted` is the remembered choice).
export function useStartChoices(wanted: string): { models: ModelChoice[]; model: ModelChoice | null; genres: ModelGenre[] } {
  const [models, setModels] = useState<ModelChoice[]>([])
  useEffect(() => {
    let live = true
    getModelChoices().then(list => { if (live) setModels(list) }).catch(() => { if (live) setModels([]) })
    return () => { live = false }
  }, [])
  // With a choice to make there is always a model chosen (the first when neither the one asked for nor the basic one is there), so what the dropdown shows is what the plus uses;
  // with one model or none, and no basic model, a new character starts with the portrait (the rule of phase 6c-5).
  const model = startModelOf(models, wanted) ?? (models.length > 1 ? models[0] : null)
  return { models, model, genres: model ? genresOf(model.content) : [] }
}
