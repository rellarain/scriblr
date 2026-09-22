import type { TileShape } from './tileShapes'

export interface TileMeta {
  id: string
  shapes: TileShape[]
  defaultShape: TileShape
}

export interface PlacedTile<T extends TileMeta> { def: T; shape: TileShape }

export interface SavedShapes { order?: string[]; shapes?: Record<string, TileShape> }

// The tiles in their saved order, each in its saved shape: ids that no longer exist
// are dropped, new tiles follow in their own order, and a saved shape the tile no
// longer allows falls back to its default. This is the seed for a fresh split tree
// (splitTree.ts's `buildTree`/`reconcile`) and for resolving each tile's current
// shape-preset button.
export function applyLayout<T extends TileMeta>(defs: T[], saved: SavedShapes | undefined): Array<PlacedTile<T>> {
  const byId = new Map(defs.map(d => [d.id, d]))
  const known = (saved?.order ?? []).filter((id, i, all) => byId.has(id) && all.indexOf(id) === i)
  const ordered = [...known, ...defs.map(d => d.id).filter(id => !known.includes(id))]
  return ordered.map(id => {
    const def = byId.get(id)!
    const wanted = saved?.shapes?.[id]
    return { def, shape: wanted && def.shapes.includes(wanted) ? wanted : def.defaultShape }
  })
}

// The next shape a tile allows, wrapping around (a tile with one shape keeps it).
export function cycleShape(meta: TileMeta, current: TileShape): TileShape {
  const i = meta.shapes.indexOf(current)
  return meta.shapes[(i + 1) % meta.shapes.length] ?? meta.defaultShape
}
