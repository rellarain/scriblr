import type { MapBiomeGroup, MapShape } from '../../../../api/types'

// Heights of the land. The base has a height (the sea floor of a planet, the plain of a region); each biome shape, drawn in order, changes the height of
// what is under it: it sets it, raises it or lowers it by its height, or keeps it. Land does not lie under the sea unless it is lowered there: a biome of
// land (not water) drawn over a height below sea level comes up to sea level first, so an island drawn on the ocean is an island, and a forest drawn over a
// mountain keeps the mountain's height. A shape with no biome of its own only changes the height.

export function landHeight(under: number, shape: Pick<MapShape, 'heightMode' | 'height' | 'biome'>, group: MapBiomeGroup | null): number {
  const h = shape.height ?? 0
  const lifted = shape.biome && group !== 'water' ? Math.max(under, 0) : under
  switch (shape.heightMode) {
    case 'set': return h
    case 'raise': return lifted + h
    case 'lower': return lifted - h
    default: return lifted
  }
}
