import type { ModelContent, ModelFrame } from '../../../../../api/types'
import { FRAME_BIGGEST, FRAME_MIN, TILE_DEFAULT, freshId, randomId, type MakeId } from '../modelContent'
import { r2, type Box } from './geometry'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'
import type { View } from './rig'

// Frames (phase 5a): named crops of the figure. A frame is a box in the model's space and the groups and objects left out when the figure is seen through it
// (a bust frame leaves out the legs). A size is never typed: the box is set by dragging its rectangle on the canvas, and by the arrow keys. The operations
// return new content (or why they cannot) and leave the content they were given alone.

export const framesOf = (c: ModelContent): ModelFrame[] => c.frames ?? []
export const frameById = (c: ModelContent, id: string | null): ModelFrame | undefined => (id ? framesOf(c).find(f => f.id === id) : undefined)
const NAME_MAX = 40
const X_RANGE: [number, number] = [-50, 250], Y_RANGE: [number, number] = [-50, 450]
const cut = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// The box of a frame (a plain copy).
export const boxOfFrame = (f: Pick<ModelFrame, 'x' | 'y' | 'w' | 'h'>): Box => ({ x: f.x, y: f.y, w: f.w, h: f.h })

// A box held inside the model's space and to the sizes a frame may have.
export function fitBox(b: Box): Box {
  const w = r2(cut(Number.isFinite(b.w) ? b.w : 100, FRAME_MIN, FRAME_BIGGEST)), h = r2(cut(Number.isFinite(b.h) ? b.h : 100, FRAME_MIN, FRAME_BIGGEST))
  return { x: r2(cut(Number.isFinite(b.x) ? b.x : 0, X_RANGE[0], X_RANGE[1])), y: r2(cut(Number.isFinite(b.y) ? b.y : 0, Y_RANGE[0], Y_RANGE[1])), w, h }
}

// The box to look through in a view: the back view turns the figure round, so a frame on a part of the body is mirrored about the axis to stay on it.
export function viewBoxOf(f: Pick<ModelFrame, 'x' | 'y' | 'w' | 'h'>, view: View, axis = 100): Box {
  return view === 'back' ? { x: 2 * axis - (f.x + f.w), y: f.y, w: f.w, h: f.h } : boxOfFrame(f)
}

// ---- dragging a box ----

export type FrameHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const FRAME_HANDLES: FrameHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// The box moved by (dx, dy).
export const movedBox = (b: Box, dx: number, dy: number): Box => fitBox({ ...b, x: b.x + dx, y: b.y + dy })

// The box with one handle dragged by (dx, dy): the opposite side stays where it is, and the box never gets smaller than a frame may.
export function resizedBox(b: Box, handle: FrameHandle, dx: number, dy: number): Box {
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h
  if (handle.includes('w')) x0 = Math.min(x0 + dx, x1 - FRAME_MIN)
  if (handle.includes('e')) x1 = Math.max(x1 + dx, x0 + FRAME_MIN)
  if (handle.includes('n')) y0 = Math.min(y0 + dy, y1 - FRAME_MIN)
  if (handle.includes('s')) y1 = Math.max(y1 + dy, y0 + FRAME_MIN)
  return fitBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
}

// ---- editing ----

const mapFrame = (c: ModelContent, id: string, change: (f: ModelFrame) => ModelFrame): ModelContent => ({ ...c, frames: framesOf(c).map(f => (f.id === id ? change(f) : f)) })

// A new frame around a box (the part of the figure on show now, say), shown through nothing hidden.
export function addFrame(c: ModelContent, box: Box, name = 'Frame', make: MakeId = randomId): Edit & { frameId?: string } {
  if (framesOf(c).length >= LIMITS.framesMax) return fail(`A model may have at most ${LIMITS.framesMax} frames.`)
  const id = freshId(c, 'f', make)
  const frame: ModelFrame = { id, name: name.trim().slice(0, NAME_MAX) || 'Frame', ...fitBox(box), hide: [] }
  return { ...done({ ...c, frames: [...framesOf(c), frame] }), frameId: id }
}

export const renameFrame = (c: ModelContent, id: string, name: string): ModelContent => mapFrame(c, id, f => ({ ...f, name: name.trim().slice(0, NAME_MAX) }))
export const removeFrame = (c: ModelContent, id: string): ModelContent => ({ ...c, frames: framesOf(c).filter(f => f.id !== id) })

// Put a frame's box somewhere (what a drag of its rectangle ends with).
export const setFrameBox = (c: ModelContent, id: string, box: Box): ModelContent => mapFrame(c, id, f => ({ ...f, ...fitBox(box) }))

// One press of an arrow key: the frame moves by (dx, dy); with `resize` its width and height change instead (the top left stays).
export function nudgeFrame(c: ModelContent, id: string, dx: number, dy: number, resize = false): ModelContent {
  const f = frameById(c, id)
  if (!f) return c
  const b = boxOfFrame(f)
  return setFrameBox(c, id, resize ? resizedBox(b, 'se', dx, dy) : movedBox(b, dx, dy))
}

// The groups and objects a frame may hide: every one the model has.
export function hideable(c: ModelContent): Array<{ id: string; name: string; kind: 'group' | 'object' }> {
  return [...c.groups.map(g => ({ id: g.id, name: g.name || g.id, kind: 'group' as const })), ...c.objects.map(o => ({ id: o.id, name: o.name || o.id, kind: 'object' as const }))]
}

// Leave a group or an object out of the frame's view, or put it back.
export function toggleFrameHide(c: ModelContent, id: string, thingId: string): Edit {
  const f = frameById(c, id)
  if (!f) return fail('There is no such frame.')
  if (!c.groups.some(g => g.id === thingId) && !c.objects.some(o => o.id === thingId)) return fail('There is no such group or object.')
  if (f.hide.includes(thingId)) return done(mapFrame(c, id, x => ({ ...x, hide: x.hide.filter(h => h !== thingId) })))
  if (f.hide.length >= LIMITS.frameHideMax) return fail(`A frame may leave out at most ${LIMITS.frameHideMax} things.`)
  return done(mapFrame(c, id, x => ({ ...x, hide: [...x.hide, thingId] })))
}

// What is switched off when the figure is seen through a frame: what the admin has switched off already, and what the frame leaves out.
export function hiddenThrough(frame: ModelFrame | undefined, hidden: Iterable<string>): string[] {
  return [...new Set([...hidden, ...(frame?.hide ?? [])])]
}

// ---- the card tile ----

// The colour of the card behind the figure that a new character starts with.
export const tileOf = (c: Pick<ModelContent, 'tile'>): string => (typeof c.tile === 'string' && /^#[0-9a-f]{6}$/i.test(c.tile) ? c.tile.toLowerCase() : TILE_DEFAULT)
export const setTile = (c: ModelContent, hex: string): ModelContent => (/^#[0-9a-f]{6}$/i.test(hex) ? { ...c, tile: hex.toLowerCase() } : c)
