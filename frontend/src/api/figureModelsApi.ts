import { api } from './client'
import type { FigureModel, FigureModelCreate } from './types'

// The copies of published models a project keeps for its characters' figures (the art mannequin, phase 6): each is made once and never changes when the admin publishes again.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/figure-models`

export function listFigureModels(projectId: string): Promise<FigureModel[]> {
  return api.get<FigureModel[]>(base(projectId))
}

// Keeps a copy of the published model `modelId` (its current version), or of the `content` a character file carries. The same content is the entry that is there already.
export function addFigureModel(projectId: string, body: FigureModelCreate): Promise<FigureModel> {
  return api.post<FigureModel>(base(projectId), body)
}
