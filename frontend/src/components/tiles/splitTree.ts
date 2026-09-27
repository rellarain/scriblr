// A binary space partition, the same shape VS Code/Claude panes use: every split
// divides its rect into two along one axis at a ratio, so a grid always fills its
// container exactly (drag a divider and only its two neighbours resize) instead of
// reflowing onto a CSS grid that can leave gaps below the last row.
import { GRID_GAP, MIN_COLUMN, ROW_UNIT, type TileShape } from './tileShapes'

export type SplitDir = 'row' | 'col'
export interface SplitLeaf { id: string; fixed?: boolean }
export interface SplitBranch { dir: SplitDir; ratio: number; a: SplitNode; b: SplitNode }
export type SplitNode = SplitLeaf | SplitBranch
export type PathStep = 'a' | 'b'
export type Path = PathStep[]

export interface Rect { x: number; y: number; w: number; h: number }

export const isLeaf = (n: SplitNode): n is SplitLeaf => !('dir' in n)

// A leaf's minimum footprint (its content minimum).
export const MIN_LEAF_W = MIN_COLUMN
export const MIN_LEAF_H = ROW_UNIT * 2 + GRID_GAP

const fixedLeaf = (id: string): SplitLeaf => ({ id, fixed: true })
const leaf = (id: string): SplitLeaf => ({ id })
const row = (a: SplitNode, b: SplitNode, ratio = 0.5): SplitBranch => ({ dir: 'row', ratio, a, b })
const col = (a: SplitNode, b: SplitNode, ratio = 0.5): SplitBranch => ({ dir: 'col', ratio, a, b })

// A fixed leaf must be a direct child of a `col` branch (stacked, not side by side) so
// it always reports a short, fixed height. Run after any edit that could place one
// under a `row` branch.
export function fixup(node: SplitNode): SplitNode {
  if (isLeaf(node)) return node
  const a = fixup(node.a)
  const b = fixup(node.b)
  const needsCol = (isLeaf(a) && a.fixed) || (isLeaf(b) && b.fixed)
  const dir = needsCol ? 'col' : node.dir
  return dir === node.dir && a === node.a && b === node.b ? node : { ...node, dir, a, b }
}

export function leafIds(node: SplitNode): string[] {
  return isLeaf(node) ? [node.id] : [...leafIds(node.a), ...leafIds(node.b)]
}

function findLeaf(node: SplitNode, id: string): SplitLeaf | null {
  if (isLeaf(node)) return node.id === id ? node : null
  return findLeaf(node.a, id) ?? findLeaf(node.b, id)
}

export function getAtPath(node: SplitNode, path: Path): SplitNode {
  let cur = node
  for (const step of path) {
    if (isLeaf(cur)) return cur
    cur = cur[step]
  }
  return cur
}

function setAtPath(node: SplitNode, path: Path, fn: (n: SplitBranch) => SplitBranch): SplitNode {
  if (path.length === 0) {
    return isLeaf(node) ? node : fn(node)
  }
  if (isLeaf(node)) return node
  const [step, ...rest] = path
  const child = setAtPath(node[step], rest, fn)
  return child === node[step] ? node : { ...node, [step]: child }
}

// A leaf's minimum size, and a branch's (its children's, combined along the split
// axis). A fully-fixed subtree (every leaf in it minimized) contributes nothing --
// it lives in the grid's own icon rail, not in this geometry, so it costs no space
// and no gap.
export function minSize(node: SplitNode): { w: number; h: number } {
  if (isAllFixed(node)) return { w: 0, h: 0 }
  if (isLeaf(node)) return { w: MIN_LEAF_W, h: MIN_LEAF_H }
  const aFixed = isAllFixed(node.a)
  const bFixed = isAllFixed(node.b)
  if (aFixed) return minSize(node.b)
  if (bFixed) return minSize(node.a)
  const ma = minSize(node.a)
  const mb = minSize(node.b)
  if (node.dir === 'row') return { w: ma.w + mb.w + GRID_GAP, h: Math.max(ma.h, mb.h) }
  return { w: Math.max(ma.w, mb.w), h: ma.h + mb.h + GRID_GAP }
}

// Whether a subtree is nothing but minimized (fixed) tiles -- such a subtree lives
// only in the grid's shared icon rail (TileGrid.tsx), never on the stage, so it
// takes no on-screen space at all and its sibling in every enclosing branch
// absorbs the space it would have used.
export function isAllFixed(node: SplitNode): boolean {
  return isLeaf(node) ? Boolean(node.fixed) : isAllFixed(node.a) && isAllFixed(node.b)
}

// How much of `total` (along the split's axis) each side gets: a fully-fixed side
// gets none of it (its sibling gets all of it -- there's no gap to reserve against
// a neighbour that isn't on the stage); otherwise the ratio is clamped so neither
// side goes below its minimum (when the container is smaller than both minimums
// combined, the ratio is used as-is and the area scrolls instead).
export function splitSizes(branch: SplitBranch, total: number): [number, number] {
  const { a, b, dir, ratio } = branch
  const aFixed = isAllFixed(a)
  const bFixed = isAllFixed(b)
  if (aFixed && bFixed) return [total, 0]
  if (aFixed) return [0, total]
  if (bFixed) return [total, 0]
  const inner = total - GRID_GAP
  const minA = dir === 'row' ? minSize(a).w : minSize(a).h
  const minB = dir === 'row' ? minSize(b).w : minSize(b).h
  const lo = inner > 0 ? minA / inner : 0
  const hi = inner > 0 ? 1 - minB / inner : 1
  const clamped = lo <= hi ? Math.min(hi, Math.max(lo, ratio)) : ratio
  const av = Math.round(inner * clamped)
  return [av, inner - av]
}

// The two sides' rects a branch splits `rect` into -- shared by computeGeometry and
// rectAtPath so they can't drift apart on the fully-fixed, no-gap case above.
function splitRect(branch: SplitBranch, rect: Rect): [Rect, Rect] {
  const total = branch.dir === 'row' ? rect.w : rect.h
  const [av, bv] = splitSizes(branch, total)
  const gap = isAllFixed(branch.a) || isAllFixed(branch.b) ? 0 : GRID_GAP
  const aRect: Rect = branch.dir === 'row' ? { ...rect, w: av } : { ...rect, h: av }
  const bRect: Rect = branch.dir === 'row'
    ? { ...rect, x: rect.x + av + gap, w: bv }
    : { ...rect, y: rect.y + av + gap, h: bv }
  return [aRect, bRect]
}

export interface TileGeometry { id: string; rect: Rect }
export interface DividerGeometry { path: Path; dir: SplitDir; rect: Rect }

// One measuring pass: every (non-fixed) tile's rect and every divider's rect and
// drag axis, laid out to fill `rect` exactly (or overflow it when below the tree's
// minimum, so the container can scroll). A fixed (minimized) leaf gets no rect at
// all here -- it lives in the grid's own icon rail instead (see fixedLeafIds).
export function computeGeometry(node: SplitNode, rect: Rect, path: Path = []): { tiles: TileGeometry[]; dividers: DividerGeometry[] } {
  if (isLeaf(node)) return node.fixed ? { tiles: [], dividers: [] } : { tiles: [{ id: node.id, rect }], dividers: [] }
  const [aRect, bRect] = splitRect(node, rect)
  const left = computeGeometry(node.a, aRect, [...path, 'a'])
  const right = computeGeometry(node.b, bRect, [...path, 'b'])
  const dividers = [...left.dividers, ...right.dividers]
  if (!isAllFixed(node.a) && !isAllFixed(node.b)) {
    const total = node.dir === 'row' ? rect.w : rect.h
    const [av] = splitSizes(node, total)
    const divRect: Rect = node.dir === 'row'
      ? { x: rect.x + av, y: rect.y, w: GRID_GAP, h: rect.h }
      : { x: rect.x, y: rect.y + av, w: rect.w, h: GRID_GAP }
    dividers.push({ path, dir: node.dir, rect: divRect })
  }
  return { tiles: [...left.tiles, ...right.tiles], dividers }
}

// The rect a branch (its two sides combined, before splitting) occupies -- what a
// divider drags against, since its own rect is just the thin gap between them.
export function rectAtPath(node: SplitNode, rect: Rect, path: Path): Rect {
  let cur = node
  let r = rect
  for (const step of path) {
    if (isLeaf(cur)) break
    const [aRect, bRect] = splitRect(cur, r)
    r = step === 'a' ? aRect : bRect
    cur = cur[step]
  }
  return r
}

// Every fixed (minimized) leaf's id, in a stable pre-order walk of the whole tree --
// the order the grid's shared icon rail stacks them in, independent of which
// branch each one actually lives under.
export function fixedLeafIds(node: SplitNode): string[] {
  return isLeaf(node) ? (node.fixed ? [node.id] : []) : [...fixedLeafIds(node.a), ...fixedLeafIds(node.b)]
}

// A branch's ratio, set directly (used by divider drag and keyboard resize); clamped
// to a sane range so a branch never fully swallows its sibling.
export function resizeBranch(tree: SplitNode, path: Path, ratio: number): SplitNode {
  const clamped = Math.min(0.92, Math.max(0.08, ratio))
  return setAtPath(tree, path, b => ({ ...b, ratio: clamped }))
}

// Exchange two tiles' places: each area keeps its own size (and fixed/mini status),
// and the tiles simply trade which area they're in.
export function swapLeaves(tree: SplitNode, idA: string, idB: string): SplitNode {
  if (idA === idB) return tree
  if (!findLeaf(tree, idA) || !findLeaf(tree, idB)) return tree
  function map(node: SplitNode): SplitNode {
    if (isLeaf(node)) {
      if (node.id === idA) return { ...node, id: idB }
      if (node.id === idB) return { ...node, id: idA }
      return node
    }
    const na = map(node.a)
    const nb = map(node.b)
    return na === node.a && nb === node.b ? node : { ...node, a: na, b: nb }
  }
  return map(tree)
}

// Removes one leaf, promoting its sibling into its place. Null only when `node`
// itself was that one leaf.
function removeLeaf(node: SplitNode, id: string): SplitNode | null {
  if (isLeaf(node)) return node.id === id ? null : node
  const a = removeLeaf(node.a, id)
  const b = removeLeaf(node.b, id)
  if (a === null) return b
  if (b === null) return a
  return a === node.a && b === node.b ? node : { ...node, a, b }
}

// Swaps one node for another, found by reference (not id) -- used to graft a
// freshly built branch back into a tree at the exact spot it was read from,
// after nodes elsewhere (outside it) may have changed shape around it.
function replaceRef(node: SplitNode, target: SplitNode, replacement: SplitNode): SplitNode {
  if (node === target) return replacement
  if (isLeaf(node)) return node
  const a = replaceRef(node.a, target, replacement)
  const b = replaceRef(node.b, target, replacement)
  return a === node.a && b === node.b ? node : { ...node, a, b }
}

// Whether a divider's branch has room, along its own axis, to also fit a third
// minimum-sized side -- what dropping a tile onto it would add -- without
// squeezing its two existing sides below their own minimums.
export function canInsertAt(tree: SplitNode, rect: Rect, path: Path, fixed: boolean): boolean {
  const branch = getAtPath(tree, path)
  if (isLeaf(branch)) return false
  const branchRect = rectAtPath(tree, rect, path)
  const axis = branch.dir === 'row' ? 'w' : 'h'
  const along = branchRect[axis]
  const newMin = minSize({ id: '', fixed })[axis]
  const need = minSize(branch)[axis] + newMin + GRID_GAP
  return along >= need
}

// Drops a dragged tile onto a divider: pulled out of wherever it was, and wedged in
// as a new side flanking that exact divider -- a row divider (side by side) gains a
// new column, a col divider (stacked) a new row -- pushing the divider's own two
// sides apart to make room for it.
export function insertAtDivider(tree: SplitNode, id: string, path: Path): SplitNode {
  const origBranch = getAtPath(tree, path)
  if (isLeaf(origBranch)) return tree
  const dragged = findLeaf(tree, id)
  if (!dragged) return tree
  const newLeaf: SplitLeaf = dragged.fixed ? { id, fixed: true } : { id }
  const { dir, ratio, a: origA, b: origB } = origBranch

  const inA = Boolean(findLeaf(origA, id))
  const inB = !inA && Boolean(findLeaf(origB, id))

  let result: SplitNode
  if (inA || inB) {
    // The dragged tile already lives on one side of this exact branch: pull it out
    // of that side (its sibling there absorbs its place) and wedge it back in,
    // right at the divider, keeping the other side untouched.
    const pruned = removeLeaf(inA ? origA : origB, id)
    if (!pruned) return tree // it WAS that whole side -- dropping it on its own divider is a no-op
    const newBranch: SplitBranch = inA
      ? { dir, ratio, a: pruned, b: { dir, ratio: 0.5, a: newLeaf, b: origB } }
      : { dir, ratio, a: origA, b: { dir, ratio: 0.5, a: newLeaf, b: pruned } }
    result = replaceRef(tree, origBranch, newBranch)
  } else {
    // It's elsewhere in the tree: remove it from there first (its old sibling
    // absorbs its place), then wedge it in at the divider, both original sides intact.
    const withoutId = removeLeaf(tree, id)
    if (!withoutId) return tree
    const newBranch: SplitBranch = { dir, ratio, a: origA, b: { dir, ratio: 0.5, a: newLeaf, b: origB } }
    result = replaceRef(withoutId, origBranch, newBranch)
  }
  return fixup(result)
}

// Whether a leaf's own rect has room to split into two side-by-side minimum-width
// tiles -- what dragging a tile onto its left or right edge margin would do. Every
// leaf's minimum width is the same (MIN_LEAF_W) regardless of shape, so only the
// rect matters here.
export function canInsertBeside(rect: Rect): boolean {
  return rect.w >= MIN_LEAF_W * 2 + GRID_GAP
}

// Drops a dragged tile onto another tile's left or right edge margin: wedged in as a
// new column right beside it (not a swap), splitting that leaf's own spot into a row
// of two -- the target keeps its own place in the tree, the dragged tile takes the
// side it was dropped toward.
export function insertBesideLeaf(tree: SplitNode, draggedId: string, targetId: string, side: 'left' | 'right'): SplitNode {
  if (draggedId === targetId) return tree
  const target = findLeaf(tree, targetId)
  if (!target) return tree
  const dragged = findLeaf(tree, draggedId)
  if (!dragged) return tree
  const newLeaf: SplitLeaf = dragged.fixed ? { id: draggedId, fixed: true } : { id: draggedId }
  const withoutId = removeLeaf(tree, draggedId)
  if (!withoutId) return tree
  const newBranch: SplitBranch = side === 'left'
    ? { dir: 'row', ratio: 0.5, a: newLeaf, b: target }
    : { dir: 'row', ratio: 0.5, a: target, b: newLeaf }
  return fixup(replaceRef(withoutId, target, newBranch))
}

// Whether a leaf's own rect has room to split into two side-by-side minimum-height
// rows -- the vertical mirror of canInsertBeside.
export function canInsertBelow(rect: Rect): boolean {
  return rect.h >= MIN_LEAF_H * 2 + GRID_GAP
}

// Drops a dragged tile onto another tile's top or bottom edge margin: wedged in as a
// new row right above/below it (not a swap) -- the vertical mirror of insertBesideLeaf.
export function insertBelowLeaf(tree: SplitNode, draggedId: string, targetId: string, side: 'top' | 'bottom'): SplitNode {
  if (draggedId === targetId) return tree
  const target = findLeaf(tree, targetId)
  if (!target) return tree
  const dragged = findLeaf(tree, draggedId)
  if (!dragged) return tree
  const newLeaf: SplitLeaf = dragged.fixed ? { id: draggedId, fixed: true } : { id: draggedId }
  const withoutId = removeLeaf(tree, draggedId)
  if (!withoutId) return tree
  const newBranch: SplitBranch = side === 'top'
    ? { dir: 'col', ratio: 0.5, a: newLeaf, b: target }
    : { dir: 'col', ratio: 0.5, a: target, b: newLeaf }
  return fixup(replaceRef(withoutId, target, newBranch))
}

// A leaf's fixed (mini) flag, changed in place; the branch that directly holds it is
// straightened out by `fixup`. This is what toggling a tile between mini and mid does.
export function setFixed(tree: SplitNode, id: string, fixed: boolean): SplitNode {
  function map(node: SplitNode): SplitNode {
    if (isLeaf(node)) return node.id === id ? { ...node, fixed } : node
    const a = map(node.a)
    const b = map(node.b)
    return a === node.a && b === node.b ? node : { ...node, a, b }
  }
  return fixup(map(tree))
}

// Every branch stacked vertically instead of split -- the one-column rule (below
// `ONE_COLUMN_BELOW`, tileShapes.ts), applied to a copy of the tree for that render
// only; the stored tree (and its `row` splits) is untouched, so widening the
// container returns to the saved arrangement.
export function flattenOneColumn(node: SplitNode): SplitNode {
  if (isLeaf(node)) return node
  const a = flattenOneColumn(node.a)
  const b = flattenOneColumn(node.b)
  return { dir: 'col', ratio: node.ratio, a, b }
}

// Builds an initial tree from a grid's placed tiles (order + shape), used to seed a
// fresh grid. Mini tiles are grouped together (their actual on-screen order comes
// from fixedLeafIds -- a pre-order walk -- not from where they sit in this tree);
// the mid tiles split the remaining space evenly, alternating axis.
export function buildTree(placed: Array<{ id: string; shape: TileShape }>): SplitNode | null {
  if (placed.length === 0) return null
  const minis = placed.filter(p => p.shape === 'mini')
  const rest = placed.filter(p => p.shape !== 'mini')

  function build(list: typeof rest, dir: SplitDir): SplitNode {
    if (list.length === 1) return leaf(list[0].id)
    const mid = Math.ceil(list.length / 2)
    const a = build(list.slice(0, mid), dir === 'row' ? 'col' : 'row')
    const b = build(list.slice(mid), dir === 'row' ? 'col' : 'row')
    return { dir, ratio: 0.5, a, b }
  }

  if (rest.length === 0) {
    // Every tile is mini (e.g. the short link tiles above a book face): all
    // stay their fixed, short height -- nothing stretches to fill leftover space.
    return fixup(miniStack(minis))
  }
  if (minis.length === 0) return fixup(build(rest, 'row'))
  return fixup(col(build(rest, 'row'), miniStack(minis)))
}

// Groups mini leaves together in the tree (a `col` chain) -- just a convenient
// initial shape; they take no on-screen space here either way (isAllFixed), and
// render in the grid's shared icon rail, ordered by fixedLeafIds, not by this tree.
function miniStack(minis: Array<{ id: string }>): SplitNode {
  let stack: SplitNode = fixedLeaf(minis[minis.length - 1].id)
  for (const mini of minis.slice(0, -1).reverse()) stack = col(fixedLeaf(mini.id), stack)
  return stack
}

// Keeps a saved tree in sync with the grid's current tiles: unknown leaves are
// pruned (replaced by their sibling), and new tiles are grafted on (mini tiles
// stacked on top, mid tiles added to the side), so ids never seen before or since
// removed degrade the same way `applyLayout`'s order list always did.
export function reconcile(tree: SplitNode | null, placed: Array<{ id: string; shape: TileShape }>): SplitNode {
  // Nothing saved yet: build fresh (buildTree's own order/shape heuristic), rather
  // than grafting tiles on one at a time in arbitrary positions.
  if (!tree) return buildTree(placed) ?? leaf(placed[0]?.id ?? '')

  const wantIds = placed.map(p => p.id)
  const shapeOf = new Map(placed.map(p => [p.id, p.shape]))

  function prune(node: SplitNode): SplitNode | null {
    if (isLeaf(node)) return wantIds.includes(node.id) ? node : null
    const a = prune(node.a)
    const b = prune(node.b)
    if (a && b) return a === node.a && b === node.b ? node : { ...node, a, b }
    return a ?? b
  }
  let cur = prune(tree)

  const have = new Set(cur ? leafIds(cur) : [])
  const missing = wantIds.filter(id => !have.has(id))
  for (const id of missing) {
    const shape = shapeOf.get(id) ?? 'mid'
    if (!cur) { cur = shape === 'mini' ? fixedLeaf(id) : leaf(id); continue }
    cur = shape === 'mini' ? col(cur, fixedLeaf(id), 0.5) : row(leaf(id), cur, 0.32)
  }
  return cur ? fixup(cur) : (buildTree(placed) ?? leaf(placed[0]?.id ?? ''))
}
