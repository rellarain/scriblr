import type { TileShape } from './tileShapes'

// A grid's saved layout: the order of its tiles and the shape each was given.
// Tiles are looked up by id, so a saved layout survives tiles being added or removed.
export interface TileLayoutState {
  order: string[]
  shapes: Record<string, TileShape>
  // The tile that was expanded into its console, restored on launch.
  open?: string | null
}

export const EMPTY_LAYOUT: TileLayoutState = { order: [], shapes: {}, open: null }

export interface TileMeta {
  id: string
  shapes: TileShape[]
  defaultShape: TileShape
}

export interface PlacedTile<T extends TileMeta> { def: T; shape: TileShape }

// The tiles in their saved order, each in its saved shape: ids that no longer exist
// are dropped, new tiles follow in their own order, and a saved shape the tile no
// longer allows falls back to its default.
export function applyLayout<T extends TileMeta>(defs: T[], saved: Partial<TileLayoutState> | undefined): Array<PlacedTile<T>> {
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

// `order` with `id` moved to just before `beforeId` (or to the end when null).
export function moveTile(order: string[], id: string, beforeId: string | null): string[] {
  if (!order.includes(id) || id === beforeId) return order
  const rest = order.filter(x => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  if (at < 0) return order
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

// `order` with `id` moved `delta` places (clamped to the ends).
export function shiftTile(order: string[], id: string, delta: number): string[] {
  const from = order.indexOf(id)
  if (from < 0) return order
  const to = Math.min(order.length - 1, Math.max(0, from + delta))
  if (to === from) return order
  const next = order.filter(x => x !== id)
  next.splice(to, 0, id)
  return next
}
