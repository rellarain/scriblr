import type { ModelPoint, ModelShape, ModelSymmetry } from '../../../../../api/types'
import { apply, boxOf, build, flatten, mul, r2, rotate, scale, transformList, translate, type Mat } from './geometry'
import { snapTo } from './gridSnap'

// Transforming a whole shape (shape editor S4). A shape keeps its points as drawn; `rot` only says how its own frame is turned, so the box around it (its frame:
// the box of its outline measured along the frame's axes) turns with it. Every transform is a matrix applied to the points and their curve handles, worked out
// from the shape as it was when a drag began, so a drag never drifts.

// A frame: its middle (in the shape's space), its size along its own axes, and its angle in degrees (clockwise on screen, since y grows downward).
export interface Frame { cx: number; cy: number; w: number; h: number; rot: number }

// The smallest a side may be made by a resize, in the model's units.
export const MIN_SIDE = 1

export const rotOf = (s: ModelShape): number => s.rot ?? 0
// An angle in degrees as kept: -180 up to (not including) 180, to two decimals.
export const normTurn = (deg: number): number => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180
  return Math.round(a * 100) / 100
}

export function frameOf(s: ModelShape): Frame | null {
  if (s.pts.length < 2) return null
  const rot = rotOf(s), poly = flatten(build(s.pts, s.closed), s.closed)
  if (!poly.length) return null
  const un = rotate(-rot, 0, 0)
  const b = boxOf(poly.map(([x, y]) => apply(un, x, y)))
  const [cx, cy] = apply(rotate(rot, 0, 0), b.x + b.w / 2, b.y + b.h / 2)
  return { cx, cy, w: b.w, h: b.h, rot }
}

// From the frame's own coordinates (its middle at 0,0, x along its width) to the shape's space, and back.
export const frameMat = (f: Frame): Mat => mul(translate(f.cx, f.cy), rotate(f.rot, 0, 0))
export const unframeMat = (f: Frame): Mat => mul(rotate(-f.rot, 0, 0), translate(-f.cx, -f.cy))

// The corners of the frame, `pad` units outside it, top left first and round clockwise.
export function frameCorners(f: Frame, pad = 0): Array<[number, number]> {
  const m = frameMat(f), hw = f.w / 2 + pad, hh = f.h / 2 + pad
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Array<[number, number]>).map(([x, y]) => apply(m, x, y))
}

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const HANDLE_NAMES: Record<BoxHandle, string> = {
  nw: 'top left corner', n: 'top side', ne: 'top right corner', e: 'right side', se: 'bottom right corner', s: 'bottom side', sw: 'bottom left corner', w: 'left side',
}
// Where a handle sits on the frame: -1, 0 or 1 across and down.
export const handleSide = (h: BoxHandle): [number, number] => [h.includes('w') ? -1 : h.includes('e') ? 1 : 0, h.includes('n') ? -1 : h.includes('s') ? 1 : 0]

export function handleAt(f: Frame, h: BoxHandle, pad = 0): [number, number] {
  const [u, v] = handleSide(h)
  return apply(frameMat(f), u * (f.w / 2 + pad), v * (f.h / 2 + pad))
}
// The turn handle: `off` units above the middle of the top side, along the frame's own up.
export const turnHandleAt = (f: Frame, off: number): [number, number] => apply(frameMat(f), 0, -f.h / 2 - off)

const roundPoint = (p: ModelPoint): ModelPoint => ({
  ...p, x: r2(p.x), y: r2(p.y),
  ...(p.hi ? { hi: [r2(p.hi[0]), r2(p.hi[1])] as [number, number] } : {}),
  ...(p.ho ? { ho: [r2(p.ho[0]), r2(p.ho[1])] as [number, number] } : {}),
})

// The shape moved by a matrix (its points, their curve handles, and its own back outline if it has one), its frame turned `turn` degrees more.
export function transformShape(s: ModelShape, m: Mat, turn = 0): ModelShape {
  const next: ModelShape = { ...s, pts: transformList(s.pts, m).map(roundPoint) }
  if (s.back) next.back = transformList(s.back, m).map(roundPoint)
  if (turn) next.rot = normTurn(rotOf(s) + turn)
  if (s.sym) next.sym = moveSymmetry(s.sym, m)
  return next
}

// The middle and axes of a symmetric shape (shape editor S6) moved by a matrix (a move, a turn, a flip, a resize): the axes are measured in the shape's frame, so a mirror
// image turns them the other way.
export function moveSymmetry(sym: ModelSymmetry, m: Mat): ModelSymmetry {
  const [cx, cy] = apply(m, sym.cx, sym.cy), mirrored = m[0] * m[3] - m[1] * m[2] < 0
  return { ...sym, cx: r2(cx), cy: r2(cy), a: mirrored ? (180 - sym.a) % 180 : sym.a }
}

// Whether a resize of a symmetric shape must keep its proportions: a stretch along the frame keeps it symmetric only when its axes are the frame's own (one or two of them,
// across and down).
export function mustKeepRatio(s: ModelShape): boolean {
  const sym = s.sym
  return !!sym && !(sym.n <= 2 && Math.abs(sym.a % 90) < 1e-6)
}

// A scale along the frame's own axes about a place in the frame's coordinates.
const frameScale = (f: Frame, sx: number, sy: number, ax = 0, ay = 0): Mat => mul(frameMat(f), mul(scale(sx, sy, ax, ay), unframeMat(f)))

export interface ResizeOptions {
  // keep the proportions (Shift, or Keep proportions in the panel)
  keep?: boolean
  // put the dragged sides on the grid lines this far apart (only for a frame that is not turned)
  grid?: number | null
  // resize about the middle, both sides moving (Ctrl; joints J1)
  fromMiddle?: boolean
}

// A resize from a handle, worked out from the shape `s0` and its frame `f0` as they were when the drag began: the opposite side or corner stays where it is and the dragged
// one follows the pointer (px, py, in the shape's space). A side is never made smaller than MIN_SIDE, so the shape does not turn inside out (Flip does that).
export function resizeFrom(s0: ModelShape, f0: Frame, h: BoxHandle, px: number, py: number, o: ResizeOptions = {}): ModelShape {
  const [u, v] = handleSide(h)
  const [lx, ly] = apply(unframeMat(f0), px, py)
  // from the opposite side, or (Ctrl, joints J1) from the middle, both sides moving
  const mid = o.fromMiddle === true, k = mid ? 2 : 1
  const ax = mid ? 0 : -u * (f0.w / 2), ay = mid ? 0 : -v * (f0.h / 2)
  let w = u ? Math.max(MIN_SIDE, (lx - ax) * u * k) : f0.w
  let ht = v ? Math.max(MIN_SIDE, (ly - ay) * v * k) : f0.h
  if (o.grid && normTurn(f0.rot) === 0) {
    if (u) w = Math.max(MIN_SIDE, (snapTo(f0.cx + ax + (u * w) / k, o.grid) - (f0.cx + ax)) * u * k)
    if (v) ht = Math.max(MIN_SIDE, (snapTo(f0.cy + ay + (v * ht) / k, o.grid) - (f0.cy + ay)) * v * k)
  }
  let sx = f0.w > 1e-6 ? w / f0.w : 1, sy = f0.h > 1e-6 ? ht / f0.h : 1
  if (o.keep || mustKeepRatio(s0)) {
    if (u && v) sx = sy = Math.max(sx, sy)
    else if (u) sy = sx
    else sx = sy
  }
  return transformShape(s0, frameScale(f0, sx, sy, ax, ay))
}

// A turn about the middle of the frame by the angle the pointer has swept about it since the drag began; `snap` (Shift) puts the frame's angle on a step of 15 degrees.
export function turnFrom(s0: ModelShape, f0: Frame, start: [number, number], px: number, py: number, snap = false): ModelShape {
  const a0 = Math.atan2(start[1] - f0.cy, start[0] - f0.cx), a1 = Math.atan2(py - f0.cy, px - f0.cx)
  let delta = ((a1 - a0) * 180) / Math.PI
  if (snap) delta = Math.round((f0.rot + delta) / 15) * 15 - f0.rot
  return delta ? transformShape(s0, rotate(delta, f0.cx, f0.cy), delta) : s0
}

// The steppers of the panel: the middle of the frame across or down, its width or height (about its middle; `keep` scales the other side as much), and its angle.
export function setPlace(s: ModelShape, axis: 'x' | 'y', value: number): ModelShape {
  const f = frameOf(s)
  if (!f) return s
  const d = value - (axis === 'x' ? f.cx : f.cy)
  return transformShape(s, translate(axis === 'x' ? d : 0, axis === 'y' ? d : 0))
}

export function setSize(s: ModelShape, side: 'w' | 'h', value: number, keep = false): ModelShape {
  const f = frameOf(s)
  if (!f) return s
  const now = side === 'w' ? f.w : f.h
  if (now <= 1e-6) return s
  const k = Math.max(MIN_SIDE, value) / now, both = keep || mustKeepRatio(s)
  return transformShape(s, frameScale(f, side === 'w' || both ? k : 1, side === 'h' || both ? k : 1))
}

export function setTurn(s: ModelShape, deg: number): ModelShape {
  const f = frameOf(s)
  if (!f) return s
  const delta = normTurn(deg - f.rot)
  return delta ? transformShape(s, rotate(delta, f.cx, f.cy), delta) : s
}

// A mirror image of the shape across (left for right) or down (top for bottom) about its frame's own middle. The points keep their order, so whatever refers to a point by
// its number still finds it; the frame keeps its angle.
export function flipShape(s: ModelShape, way: 'across' | 'down'): ModelShape {
  const f = frameOf(s)
  if (!f) return s
  return transformShape(s, frameScale(f, way === 'across' ? -1 : 1, way === 'down' ? -1 : 1))
}

// The shape moved so the middle of its frame is on the middle of the model across (the mirror line) or down (`centre`, in the shape's space).
export const alignShape = (s: ModelShape, axis: 'x' | 'y', centre: [number, number]): ModelShape => setPlace(s, axis, axis === 'x' ? centre[0] : centre[1])
