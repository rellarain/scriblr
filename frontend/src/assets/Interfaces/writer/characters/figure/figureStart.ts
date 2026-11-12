import { useEffect, useState } from 'react'
import { getPublishedModels } from '../../../../../api/characterModelsApi'
import type { CharacterFigure, ModelGenre, PublishedModelOut } from '../../../../../api/types'
import { genresOf } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import { ensureFigureModel } from './figureModelStore'
import { blankFigure, rollFigure } from './figureState'

// How a new character starts (phase 6c-5): as a mannequin of the basic model, with a first look rolled within a genre, instead of the plain portrait. The basic model is the one the
// app comes with (published on a fresh install); when it is not published (the admin took it away) a new character starts with the portrait, as before, and the Portrait section can
// still make a mannequin from any published model. Nothing here adds or publishes a model: that is the admin's.

export const START_MODEL_ID = 'basic'
// Where the genre chosen beside the plus is remembered.
export const START_GENRE_KEY = 'scriblr.characters.startGenre'

// The model a new character starts on, among the published ones (none when the basic model is not among them).
export const startModelOf = (models: PublishedModelOut[] | null | undefined): PublishedModelOut | null => (models ?? []).find(m => m.id === START_MODEL_ID) ?? null

const seed = () => Math.floor(Math.random() * 0x100000000)

// The first figure of a new character: the project's copy of the basic model (made once, shared by every character that uses it) and a look rolled within `genre` (null or a
// genre the model does not have: any). Null when there is no basic model to start from. Rejects when the models cannot be read or the copy cannot be made (the caller falls back).
export async function startFigure(projectId: string, genre: string | null, rngSeed: number = seed()): Promise<CharacterFigure | null> {
  const model = startModelOf((await getPublishedModels()).models)
  if (!model) return null
  const copy = await ensureFigureModel(projectId, { modelId: model.id })
  const wanted = genre && genresOf(copy.content).some(g => g.id === genre) ? genre : null
  return rollFigure(copy.content, { ...blankFigure(copy.id, copy.content), genre: wanted }, seededRng(rngSeed))
}

// The genres a new character can start in (those of the basic model), for the dropdown beside the plus; empty until they are read, and when there is no basic model.
export function useStartGenres(): ModelGenre[] {
  const [genres, setGenres] = useState<ModelGenre[]>([])
  useEffect(() => {
    let live = true
    getPublishedModels()
      .then(r => { const model = startModelOf(r.models); if (live) setGenres(model ? genresOf(model.content) : []) })
      .catch(() => { if (live) setGenres([]) })
    return () => { live = false }
  }, [])
  return genres
}
