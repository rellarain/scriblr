import { api } from './client'
import type { MapCreate, MapDoc, MapPlace, MapSummary } from './types'

// The project's maps. The list has no cells; a map is read whole when it is opened and replaced whole when it is saved.
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/maps`

export function listMaps(projectId: string): Promise<MapSummary[]> {
  return api.get<MapSummary[]>(base(projectId))
}

export function createMap(projectId: string, body: MapCreate): Promise<MapDoc> {
  return api.post<MapDoc>(base(projectId), body)
}

export function getMap(projectId: string, mapId: string): Promise<MapDoc> {
  return api.get<MapDoc>(`${base(projectId)}/${encodeURIComponent(mapId)}`)
}

export function putMap(projectId: string, doc: MapDoc): Promise<MapDoc> {
  return api.put<MapDoc>(`${base(projectId)}/${encodeURIComponent(doc.id)}`, doc)
}

// Deleting a map moves the maps inside it up to its parent.
export function deleteMap(projectId: string, mapId: string): Promise<void> {
  return api.delete<void>(`${base(projectId)}/${encodeURIComponent(mapId)}`)
}

// Every place (named symbol) of every map, with the maps it is inside: the choices for a scene's location.
export function listPlaces(projectId: string): Promise<MapPlace[]> {
  return api.get<MapPlace[]>(`${base(projectId)}/places/all`)
}

// A version of a map as it is now, to change for a later point of the story (`appliesFrom` is an outline chapter or scene).
export function createMapVersion(projectId: string, mapId: string, body: { title?: string; appliesFrom?: string | null }): Promise<MapDoc> {
  return api.post<MapDoc>(`${base(projectId)}/${encodeURIComponent(mapId)}/versions`, body)
}
