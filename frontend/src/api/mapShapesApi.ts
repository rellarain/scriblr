import { api } from './client'
import type { MapLibraryShape, MapShapeCatalog, MyMapShape } from './types'

// The admin's default map shapes (one draft, published as a whole: every project offers the published list, by level) and a writer's own ("My shapes",
// kept in the app for every project, each with the project it came from).

export function getShapeCatalog(): Promise<MapShapeCatalog> {
  return api.get<MapShapeCatalog>('/map-shapes')
}

export function putShapeDraft(shapes: MapLibraryShape[]): Promise<MapShapeCatalog> {
  return api.put<MapShapeCatalog>('/map-shapes', { shapes })
}

export function getPublishedShapes(): Promise<{ shapes: MapLibraryShape[] }> {
  return api.get<{ shapes: MapLibraryShape[] }>('/map-shapes/published')
}

export function publishShapes(): Promise<MapShapeCatalog> {
  return api.post<MapShapeCatalog>('/map-shapes/publish')
}

export function discardShapeChanges(): Promise<MapShapeCatalog> {
  return api.post<MapShapeCatalog>('/map-shapes/discard')
}

export function restoreShapeVersion(version: number): Promise<MapShapeCatalog> {
  return api.post<MapShapeCatalog>(`/map-shapes/restore/${version}`)
}

export function getMyShapes(): Promise<{ shapes: MyMapShape[] }> {
  return api.get<{ shapes: MyMapShape[] }>('/my-map-shapes')
}

export function addMyShape(shape: MapLibraryShape, projectId: string, projectTitle: string): Promise<MyMapShape> {
  return api.post<MyMapShape>('/my-map-shapes', { shape, projectId, projectTitle })
}

export function renameMyShape(id: string, name: string): Promise<MyMapShape> {
  return api.patch<MyMapShape>(`/my-map-shapes/${encodeURIComponent(id)}`, { name })
}

export function deleteMyShape(id: string): Promise<void> {
  return api.delete<void>(`/my-map-shapes/${encodeURIComponent(id)}`)
}
