import {
  canInsertAt, canInsertAtGridEdge, canInsertBelow, canInsertBeside, insertAtDivider, insertAtGridEdge, insertBelowLeaf,
  insertBesideLeaf, swapLeaves, touchesStageEdge,
  type DividerGeometry, type EdgeSide, type Path, type Rect, type SplitNode, type TileGeometry,
} from './splitTree'

// Where a dragged tile lands. The tile under the pointer is cut into a 3x3 grid:
//
//   top-left      top-centre     top-right
//   middle-left   middle-centre  middle-right
//   bottom-left   bottom-centre  bottom-right
//
// The middle is a swap; the four edge cells (top-, bottom-centre, middle-left, -right) insert the tile above, below, left or
// right of the hovered one; a corner cell takes whichever of its two edges the pointer is nearer, and when the hovered
// tile touches that outer edge of the grid it is a new row or column across the whole grid there, otherwise it is the
// edge cell next to it. A divider is a wedge: a new column or row right there.
export type DropPlan =
  | { kind: 'swap'; target: string }
  | { kind: 'beside'; target: string; side: 'left' | 'right' }
  | { kind: 'below'; target: string; side: 'top' | 'bottom' }
  | { kind: 'edge'; side: EdgeSide }
  | { kind: 'divider'; path: Path }

export type DropZone = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br'

// The cell of the 3x3 grid a point (in the tile's own box) is in.
export function zoneAt(box: Rect, x: number, y: number): DropZone {
  const cx = box.w > 0 ? Math.min(2, Math.max(0, Math.floor(((x - box.x) / box.w) * 3))) : 1
  const cy = box.h > 0 ? Math.min(2, Math.max(0, Math.floor(((y - box.y) / box.h) * 3))) : 1
  return (['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'] as const)[cy * 3 + cx]
}

export interface DropContext {
  tree: SplitNode
  stage: Rect
  draggedId: string
  // One column wide: nothing can be put beside a tile or in a new column.
  oneColumn: boolean
}

// What dropping on a tile's edge (or the outer edge of the grid, for a corner) would do, or null when there is no room.
function edgePlan(side: EdgeSide, target: TileGeometry, ctx: DropContext, corner: boolean): DropPlan | null {
  const horizontal = side === 'left' || side === 'right'
  if (horizontal && ctx.oneColumn) return null
  if (corner && touchesStageEdge(target.rect, ctx.stage, side) && canInsertAtGridEdge(ctx.tree, ctx.draggedId, side, ctx.stage)) return { kind: 'edge', side }
  if (horizontal) return canInsertBeside(target.rect) ? { kind: 'beside', target: target.id, side: side as 'left' | 'right' } : null
  return canInsertBelow(target.rect) ? { kind: 'below', target: target.id, side: side as 'top' | 'bottom' } : null
}

// The drop for a pointer at (x, y) over `target` (both in the grid's coordinates), or null where nothing can be dropped.
export function planOnTile(target: TileGeometry, x: number, y: number, ctx: DropContext): DropPlan | null {
  if (target.id === ctx.draggedId) return null
  const zone = zoneAt(target.rect, x, y)
  switch (zone) {
    case 'c': return { kind: 'swap', target: target.id }
    case 't': return edgePlan('top', target, ctx, false)
    case 'b': return edgePlan('bottom', target, ctx, false)
    case 'l': return edgePlan('left', target, ctx, false)
    case 'r': return edgePlan('right', target, ctx, false)
  }
  // A corner: how far the pointer is from each of the cell's two edges, as a share of the cell, so the split between the
  // two is the cell's own diagonal whatever the tile's shape.
  const { rect } = target
  const left = zone === 'tl' || zone === 'bl'
  const top = zone === 'tl' || zone === 'tr'
  const u = Math.abs((left ? x - rect.x : rect.x + rect.w - x) / (rect.w / 3))
  const v = Math.abs((top ? y - rect.y : rect.y + rect.h - y) / (rect.h / 3))
  const h: EdgeSide = left ? 'left' : 'right'
  const vert: EdgeSide = top ? 'top' : 'bottom'
  const order = u <= v ? [h, vert] : [vert, h]
  for (const side of order) {
    const plan = edgePlan(side, target, ctx, true)
    if (plan) return plan
  }
  return null
}

// The wedge for a pointer over a divider (the thin gap between two tiles), or null when its branch has no room for a third side.
export function planOnDivider(divider: DividerGeometry, ctx: DropContext): DropPlan | null {
  if (ctx.oneColumn) return null
  return canInsertAt(ctx.tree, ctx.stage, divider.path, false) ? { kind: 'divider', path: divider.path } : null
}

// The drop under the pointer: a tile's zone, else a divider (the gap between tiles), else nothing.
export function planAt(
  geometry: { tiles: TileGeometry[]; dividers: DividerGeometry[] }, x: number, y: number, ctx: DropContext,
): DropPlan | null {
  for (const t of geometry.tiles) {
    const r = t.rect
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return planOnTile(t, x, y, ctx)
  }
  for (const d of geometry.dividers) {
    const r = d.rect
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return planOnDivider(d, ctx)
  }
  return null
}

// The tree after a drop (pure: the preview is this tree laid out, the drop is this tree saved).
export function applyDrop(tree: SplitNode, draggedId: string, plan: DropPlan): SplitNode {
  switch (plan.kind) {
    case 'swap': return swapLeaves(tree, draggedId, plan.target)
    case 'beside': return insertBesideLeaf(tree, draggedId, plan.target, plan.side)
    case 'below': return insertBelowLeaf(tree, draggedId, plan.target, plan.side)
    case 'edge': return insertAtGridEdge(tree, draggedId, plan.side)
    case 'divider': return insertAtDivider(tree, draggedId, plan.path)
  }
}

// Whether two plans are the same drop (the preview only moves when it changes).
export function samePlan(a: DropPlan | null, b: DropPlan | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  switch (a.kind) {
    case 'swap': return a.target === (b as typeof a).target
    case 'beside':
    case 'below': return a.target === (b as typeof a).target && a.side === (b as typeof a).side
    case 'edge': return a.side === (b as typeof a).side
    case 'divider': return a.path.join('.') === (b as typeof a).path.join('.')
  }
}
