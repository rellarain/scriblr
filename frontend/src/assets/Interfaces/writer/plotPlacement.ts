import type { Awareness, OutlineNode, PlotNode, PlotPlacement } from '../../../api/types'
import { DEFAULT_AWARENESS, awarenessNext } from './awareness'
import { levelOfTarget, type PlacedPoint } from './plotTree'

// Where plotpoints (the values of fields) are placed in the outline. A plotpoint can be placed on many outline nodes (a chapter, act, scene
// or moment), each place a PLACEMENT that stands alone: its own awareness (only on a moment) and paragraph, removed or moved on its own.
// A plotpoint is on a target once at most, and PLACED once it has at least one placement. Placed, it stays in the tray (every value does).
// Everything here is pure: the workspace applies the results.
//
// A plotpoint saved before it could be placed many times held its one place in `assignedMomentId` (with `assignedParagraphIndex` and
// `awareness`); the backend reads those into a first placement on load, and migratePlot does the same for a plot that did not come through it.

// The same limit as the backend's.
export const MAX_PLACEMENTS = 100

const newPlacementId = () => `pl-${Math.random().toString(36).slice(2, 9)}`

// ---- reading ----

export const placementsOf = (point: PlotNode): PlotPlacement[] => point.placements ?? []

// The placements that are really somewhere: their target exists and takes plotpoints (a chapter, act, scene or moment).
export function livePlacements(point: PlotNode, outlineById: Map<string, OutlineNode>): PlotPlacement[] {
  return placementsOf(point).filter(p => levelOfTarget(p.targetId, outlineById) !== 'none')
}

// How many times a plotpoint is placed: the number the counters show.
export const placedCount = (point: PlotNode, outlineById: Map<string, OutlineNode>): number => livePlacements(point, outlineById).length
export const isPlaced = (point: PlotNode, outlineById: Map<string, OutlineNode>): boolean => placedCount(point, outlineById) > 0

// Every placement of every plotpoint, as (plotpoint, placement) pairs.
export const allPlacements = (plotNodes: PlotNode[]): PlacedPoint[] =>
  plotNodes.flatMap(point => (point.kind === 'plotpoint' ? placementsOf(point).map(placement => ({ point, placement })) : []))

// The placements on each outline node, in the plotpoints' own order.
export function pointsByTarget(plotNodes: PlotNode[]): Map<string, PlacedPoint[]> {
  const map = new Map<string, PlacedPoint[]>()
  for (const entry of allPlacements(plotNodes)) {
    const list = map.get(entry.placement.targetId)
    if (list) list.push(entry)
    else map.set(entry.placement.targetId, [entry])
  }
  for (const list of map.values()) list.sort((a, b) => a.point.order - b.point.order)
  return map
}

// A placement's place among its plotpoint's placements in story order ("2 of 3"). `positions` is outlinePositions(outlineNodes), worked out once.
export function placementNumber(point: PlotNode, placementId: string, positions: Map<string, number>): { n: number; of: number } {
  const placements = [...placementsOf(point)].sort((a, b) => (positions.get(a.targetId) ?? Infinity) - (positions.get(b.targetId) ?? Infinity))
  return { n: placements.findIndex(p => p.id === placementId) + 1, of: placements.length }
}

// ---- changing ----

// `nodes` with one plotpoint changed; the same array when `change` returns the plotpoint it was given.
function changePoint(nodes: PlotNode[], pointId: string, change: (point: PlotNode) => PlotNode): PlotNode[] {
  const point = nodes.find(n => n.id === pointId)
  if (!point || point.kind !== 'plotpoint') return nodes
  const next = change(point)
  return next === point ? nodes : nodes.map(n => (n.id === pointId ? next : n))
}

// Only a moment has an awareness: front-stage at first, or the one it had on a moment before.
const awarenessOn = (target: OutlineNode | undefined, was: Awareness | null | undefined): Awareness | null =>
  target?.kind === 'moment' ? was ?? DEFAULT_AWARENESS : null

// Place a plotpoint on a chapter, act, scene or moment. Nothing happens for anything else, for a target it is already on, or at the limit.
export function placeValue(
  nodes: PlotNode[], pointId: string, targetId: string, outlineById: Map<string, OutlineNode>, makeId: () => string = newPlacementId,
): PlotNode[] {
  const target = outlineById.get(targetId)
  if (levelOfTarget(targetId, outlineById) === 'none') return nodes
  return changePoint(nodes, pointId, point => {
    const have = placementsOf(point)
    if (have.some(p => p.targetId === targetId) || have.length >= MAX_PLACEMENTS) return point
    const placement: PlotPlacement = { id: makeId(), targetId, paragraphIndex: null, awareness: awarenessOn(target, null) }
    return { ...point, placements: [...have, placement] }
  })
}

// Put one placement on another target. A plotpoint already on that target keeps the one it has there, and this one goes (they were the same
// place); a target that takes no plotpoints changes nothing. Moved onto a moment it keeps the awareness it had, else front-stage.
export function movePlacement(
  nodes: PlotNode[], pointId: string, placementId: string, targetId: string, outlineById: Map<string, OutlineNode>,
): PlotNode[] {
  const target = outlineById.get(targetId)
  if (levelOfTarget(targetId, outlineById) === 'none') return nodes
  return changePoint(nodes, pointId, point => {
    const moving = placementsOf(point).find(p => p.id === placementId)
    if (!moving || moving.targetId === targetId) return point
    if (placementsOf(point).some(p => p.targetId === targetId)) return { ...point, placements: placementsOf(point).filter(p => p.id !== placementId) }
    return {
      ...point,
      placements: placementsOf(point).map(p => (p.id === placementId ? { ...p, targetId, paragraphIndex: null, awareness: awarenessOn(target, p.awareness) } : p)),
    }
  })
}

// Take one placement away (the plotpoint stays, in the tray, with its other placements).
export function unplace(nodes: PlotNode[], pointId: string, placementId: string): PlotNode[] {
  return changePoint(nodes, pointId, point => (
    placementsOf(point).some(p => p.id === placementId) ? { ...point, placements: placementsOf(point).filter(p => p.id !== placementId) } : point
  ))
}

// Step one placement's awareness to the next of the four. It has one only on a moment.
export function cycleAwareness(nodes: PlotNode[], pointId: string, placementId: string): PlotNode[] {
  return changePoint(nodes, pointId, point => {
    const placement = placementsOf(point).find(p => p.id === placementId)
    if (!placement?.awareness) return point
    const awareness = awarenessNext(placement.awareness)
    return { ...point, placements: placementsOf(point).map(p => (p.id === placementId ? { ...p, awareness } : p)) }
  })
}

// Outline nodes are going: a placement on one of them falls back to `fallbackId` (the chapter around it) when it has one and the plotpoint is
// not already there, and goes otherwise.
export function retargetPlacements(nodes: PlotNode[], removed: Set<string>, fallbackId: string | null, outlineById: Map<string, OutlineNode>): PlotNode[] {
  const fallback = fallbackId ? outlineById.get(fallbackId) : undefined
  const affected = (point: PlotNode) => point.kind === 'plotpoint' && placementsOf(point).some(p => removed.has(p.targetId))
  if (!nodes.some(affected)) return nodes
  return nodes.map(point => {
    if (!affected(point)) return point
    const placements: PlotPlacement[] = []
    for (const p of placementsOf(point)) {
      if (!removed.has(p.targetId)) { placements.push(p); continue }
      if (!fallback || placements.some(q => q.targetId === fallback.id) || placementsOf(point).some(q => q.targetId === fallback.id)) continue
      placements.push({ ...p, targetId: fallback.id, paragraphIndex: null, awareness: awarenessOn(fallback, null) })
    }
    return { ...point, placements }
  })
}

// ---- migration ----

// The placements a plot node should hold: the old single place read in as the first (when it is not already one), and then one to a target
// (the first wins), within the limit, none on a target that takes no plotpoints, and the awareness only on a moment (front-stage when it has none). Returns the node it was given when
// nothing changes. An outline that has not loaded (`outlineById` empty) leaves the placements as they are.
export function repairPlacements(point: PlotNode, outlineById: Map<string, OutlineNode>, makeId: () => string = newPlacementId): PlotNode {
  const old = point.assignedMomentId
  let placements = placementsOf(point)
  if (old && !placements.some(p => p.targetId === old)) {
    placements = [{ id: makeId(), targetId: old, paragraphIndex: point.assignedParagraphIndex ?? null, awareness: point.awareness ?? null }, ...placements]
  }
  // A target that exists but takes no plotpoints (a series, book or arc) is no place (only chapters, acts, scenes and moments are).
  const takes = (p: PlotPlacement) => outlineById.size === 0 || !outlineById.has(p.targetId) || levelOfTarget(p.targetId, outlineById) !== 'none'
  const seen = new Set<string>()
  const kept = placements.filter(p => takes(p) && !seen.has(p.targetId) && Boolean(seen.add(p.targetId))).slice(0, MAX_PLACEMENTS)
  const fixed = outlineById.size === 0 ? kept : kept.map(p => {
    const target = outlineById.get(p.targetId)
    if (!target) return p
    const awareness = awarenessOn(target, p.awareness)
    return awareness === (p.awareness ?? null) ? p : { ...p, awareness }
  })
  const changed = fixed.length !== placementsOf(point).length || fixed.some((p, i) => p !== placementsOf(point)[i])
  const hasOld = point.assignedMomentId != null || point.assignedParagraphIndex != null || point.awareness != null
  if (!changed && !hasOld) return point
  return { ...point, placements: fixed, assignedMomentId: null, assignedParagraphIndex: null, awareness: null }
}
