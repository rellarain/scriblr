import type { TileShape } from './tileShapes'

export interface TileMeta {
  id: string
  defaultShape: TileShape
}

export interface PlacedTile<T extends TileMeta> { def: T; shape: TileShape }

export interface SavedShapes { order?: string[]; shapes?: Record<string, string> }

// The tiles in their saved order, each in its saved shape (mini or mid): ids that no
// longer exist are dropped, new tiles follow in their own order, and anything else
// stored under the shape key (an old tile-shape value from before, or garbage) falls
// back to the tile's default. This is the seed for a fresh split tree
// (splitTree.ts's `buildTree`/`reconcile`).
export function applyLayout<T extends TileMeta>(defs: T[], saved: SavedShapes | undefined): Array<PlacedTile<T>> {
  const byId = new Map(defs.map(d => [d.id, d]))
  const known = (saved?.order ?? []).filter((id, i, all) => byId.has(id) && all.indexOf(id) === i)
  const ordered = [...known, ...defs.map(d => d.id).filter(id => !known.includes(id))]
  return ordered.map(id => {
    const def = byId.get(id)!
    const wanted = saved?.shapes?.[id]
    return { def, shape: wanted === 'mini' || wanted === 'mid' ? wanted : def.defaultShape }
  })
}
