import { api } from './client'
import type { MapBiome, MapBiomeCatalog } from './types'

// The admin's biome list (one draft, published as a whole: every project draws its maps with the published list) and a project's own biomes.

export function getBiomeCatalog(): Promise<MapBiomeCatalog> {
  return api.get<MapBiomeCatalog>('/map-biomes')
}

export function putBiomeDraft(biomes: MapBiome[]): Promise<MapBiomeCatalog> {
  return api.put<MapBiomeCatalog>('/map-biomes', { biomes })
}

// The biomes every project draws with (retired ones too, so maps that use them keep their colour).
export function getPublishedBiomes(): Promise<{ biomes: MapBiome[] }> {
  return api.get<{ biomes: MapBiome[] }>('/map-biomes/published')
}

export function publishBiomes(): Promise<MapBiomeCatalog> {
  return api.post<MapBiomeCatalog>('/map-biomes/publish')
}

export function discardBiomeChanges(): Promise<MapBiomeCatalog> {
  return api.post<MapBiomeCatalog>('/map-biomes/discard')
}

export function restoreBiomeVersion(version: number): Promise<MapBiomeCatalog> {
  return api.post<MapBiomeCatalog>(`/map-biomes/restore/${version}`)
}

const projectBase = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/map-biomes`

export function getProjectBiomes(projectId: string): Promise<{ biomes: MapBiome[] }> {
  return api.get<{ biomes: MapBiome[] }>(projectBase(projectId))
}

// Replaces the project's own biomes; one a map still uses is kept as retired when it is left out.
export function putProjectBiomes(projectId: string, biomes: MapBiome[]): Promise<{ biomes: MapBiome[] }> {
  return api.put<{ biomes: MapBiome[] }>(projectBase(projectId), { biomes })
}
